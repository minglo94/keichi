import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isTeacherOrAdmin } from "@/lib/roles"
import { requireClassAccess } from "@/lib/class-perm"
import { canRecordHomework } from "@/lib/class-rep"
import { hkDayStart, hkYmd } from "@/lib/hk-date"
import { notifyMany } from "@/lib/notify"
import { dbErrorMessage } from "@/lib/db-error"
import { z } from "zod"

type Params = { params: { classId: string } }

const HOMEWORK_SELECT = {
  id: true, classId: true, subject: true, title: true, detail: true,
  assignedOn: true, dueDate: true, byRole: true, confirmedAt: true, createdAt: true,
  recordedBy: true,
  recorder: { select: { id: true, name: true } },
} as const

/**
 * 欠交 and 缺席未交 counted separately — a student absent on the day isn't a
 * 欠交, and lumping them together would overstate who needs chasing.
 */
async function withCounts<T extends { id: string }>(items: T[]) {
  const groups = await prisma.lessonRecord.groupBy({
    by: ["homeworkId", "kind"],
    where: { homeworkId: { in: items.map((h) => h.id) }, kind: { in: ["MISSING_HOMEWORK", "HOMEWORK_ABSENT"] } },
    _count: { _all: true },
  })
  const n = (id: string, kind: string) => groups.find((g) => g.homeworkId === id && g.kind === kind)?._count._all ?? 0
  return items.map((h) => ({ ...h, missing: n(h.id, "MISSING_HOMEWORK"), absent: n(h.id, "HOMEWORK_ABSENT") }))
}

// GET — this class's homework, newest first. Teachers with access only; the
// student view (Phase 3) has its own route scoped to the student's classes.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const gate = await requireClassAccess(params.classId, session.user)
  if (gate instanceof NextResponse) return gate
  try {
    const homework = await prisma.homework.findMany({
      where: { classId: gate.cls.id }, select: HOMEWORK_SELECT,
      orderBy: [{ assignedOn: "desc" }, { createdAt: "desc" }], take: 100,
    })
    return NextResponse.json({ homework: await withCounts(homework) })
  } catch (err) {
    const msg = dbErrorMessage(err)
    return NextResponse.json({ error: msg ?? "未能載入功課" }, { status: msg ? 503 : 500 })
  }
}

const YMD = /^\d{4}-\d{2}-\d{2}$/
const schema = z.object({
  title:      z.string().trim().min(1).max(120),
  detail:     z.string().trim().max(2000).optional(),
  subject:    z.string().trim().max(30).optional(),
  assignedOn: z.string().regex(YMD).optional(),
  dueDate:    z.string().regex(YMD).nullable().optional(),
  sessionId:  z.string().optional(),
})

// POST — record homework. A teacher with access to the class, or a 課代表 of
// it (for their own subject). Who recorded it and in what role is taken from
// the session, never from the request.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "請填寫功課內容" }, { status: 400 })
  const d = parsed.data

  let byRole: "TEACHER" | "REP"
  if (isTeacherOrAdmin(session.user.role)) {
    const gate = await requireClassAccess(params.classId, session.user)
    if (gate instanceof NextResponse) return gate
    byRole = "TEACHER"
  } else {
    if (!await canRecordHomework(params.classId, session.user.id, d.subject ?? null)) {
      return NextResponse.json({ error: "只有此班的課代表可以記錄功課（科代表只可記錄自己的科目）" }, { status: 403 })
    }
    byRole = "REP"
  }

  if (d.dueDate && d.assignedOn && d.dueDate < d.assignedOn) {
    return NextResponse.json({ error: "限期不可以早過派發日期" }, { status: 400 })
  }

  try {
    // A session id is only kept if it really is a lesson of this class.
    const sessionId = d.sessionId
      ? (await prisma.classroomSession.findFirst({ where: { id: d.sessionId, classId: params.classId }, select: { id: true } }))?.id ?? null
      : null

    const hw = await prisma.homework.create({
      data: {
        classId: params.classId, sessionId,
        title: d.title, detail: d.detail || null, subject: d.subject || null,
        assignedOn: hkDayStart(d.assignedOn ?? hkYmd()),
        dueDate:    d.dueDate ? hkDayStart(d.dueDate) : null,
        recordedBy: session.user.id, byRole,
      },
      select: HOMEWORK_SELECT,
    })
    const [withN] = await withCounts([hw])

    // A rep's entry is visible to the class's teachers rather than silent.
    if (byRole === "REP") {
      const cls = await prisma.class.findUnique({ where: { id: params.classId }, select: { name: true, teacherId: true, homeroomTeacherId: true } })
      const to = Array.from(new Set([cls?.teacherId, cls?.homeroomTeacherId].filter((x): x is string => !!x)))
      if (to.length) {
        await notifyMany(to, {
          type: "GENERAL", title: `課代表記錄了功課：${cls?.name ?? ""} ${d.subject ?? ""}`.trim(),
          body: d.title, link: `/teacher/classroom/${params.classId}`,
        })
      }
    }
    return NextResponse.json(withN, { status: 201 })
  } catch (err) {
    const msg = dbErrorMessage(err)
    console.error("[homework POST]", err)
    return NextResponse.json({ error: msg ?? "未能儲存功課" }, { status: msg ? 503 : 500 })
  }
}
