import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isTeacherOrAdmin } from "@/lib/roles"
import { requireClassAccess } from "@/lib/class-perm"
import { canRecordHomework } from "@/lib/class-rep"
import { loadRoster } from "@/lib/classroom-roster"
import { notifyMany } from "@/lib/notify"
import { hkDayStart, hkYmd } from "@/lib/hk-date"
import { dbErrorMessage } from "@/lib/db-error"
import { HOMEWORK_KINDS } from "@/lib/lesson-records"
import { z } from "zod"

// 收功課: each student's outcome for this homework — 有交, 欠交 or 缺席.
//
// The teacher sets the homework in class; later the 課代表 collects it and
// marks each student against that same homework — nothing re-typed. Both the
// rep and the teacher work from this one list, so they always see the same
// thing, whoever recorded each outcome.
//
// Only exceptions are stored: 有交 is the absence of a row. 欠交 is a
// MISSING_HOMEWORK record, 缺席 a HOMEWORK_ABSENT one (absent that day — still
// owes it, but isn't counted as 欠交). A student holds at most one of the two.
//
// A rep sees only the roster and this homework's outcomes. Nothing else about
// classmates (absences from lessons, performance) is exposed.

type Params = { params: { classId: string; hwId: string } }
type User = { id: string; role: Parameters<typeof isTeacherOrAdmin>[0] }

async function authorise(params: Params["params"], user: User) {
  const hw = await prisma.homework.findFirst({
    where:  { id: params.hwId, classId: params.classId },
    select: {
      id: true, title: true, subject: true, byRole: true, recordedBy: true,
      class: { select: { id: true, name: true, teacherId: true, homeroomTeacherId: true } },
    },
  })
  if (!hw) return NextResponse.json({ error: "找不到功課" }, { status: 404 })
  if (isTeacherOrAdmin(user.role)) {
    const gate = await requireClassAccess(params.classId, { id: user.id, role: user.role })
    if (gate instanceof NextResponse) return gate
    return { hw, teacher: true }
  }
  if (!await canRecordHomework(params.classId, user.id, hw.subject)) {
    return NextResponse.json({ error: "只有此班的課代表可以收功課（科代表只限自己的科目）" }, { status: 403 })
  }
  return { hw, teacher: false }
}

async function outcomes(hwId: string, me: string) {
  const rows = await prisma.lessonRecord.findMany({
    where:  { homeworkId: hwId, kind: { in: [...HOMEWORK_KINDS] } },
    select: { id: true, studentId: true, kind: true, authorId: true, resolved: true, author: { select: { name: true, role: true } } },
  })
  return rows.map((r) => ({
    id: r.id, studentId: r.studentId,
    status: r.kind === "HOMEWORK_ABSENT" ? ("ABSENT" as const) : ("MISSING" as const),
    resolved: r.resolved, recordedBy: r.author.name, byRep: r.author.role === "STUDENT", mine: r.authorId === me,
  }))
}

// GET — the roster and each student's outcome.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await authorise(params, session.user)
  if (ok instanceof NextResponse) return ok
  try {
    const roster = await loadRoster(ok.hw.class.id, ok.hw.class.name)
    return NextResponse.json({
      homework: { id: ok.hw.id, title: ok.hw.title, subject: ok.hw.subject },
      roster:   roster.map((r) => ({ id: r.id, tag: r.tag, name: r.name ?? r.nameEn })),
      outcomes: await outcomes(ok.hw.id, session.user.id),
    })
  } catch (err) {
    const msg = dbErrorMessage(err)
    return NextResponse.json({ error: msg ?? "未能載入" }, { status: msg ? 503 : 500 })
  }
}

const schema = z.object({
  studentId: z.string().min(1),
  status:    z.enum(["SUBMITTED", "MISSING", "ABSENT"]),
  /** Teachers only: tie the record to the lesson it was noted in. */
  sessionId: z.string().optional(),
})

// PUT — set one student's outcome. Idempotent: setting what's already there
// changes nothing. A rep may only change outcomes they recorded themselves,
// and not once a teacher has marked them 已跟進.
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await authorise(params, session.user)
  if (ok instanceof NextResponse) return ok

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "資料不完整" }, { status: 400 })
  const { studentId, status } = parsed.data
  const me = session.user.id

  try {
    const enrolled = await prisma.classEnrollment.findFirst({ where: { classId: params.classId, studentId }, select: { id: true } })
    if (!enrolled) return NextResponse.json({ error: "學生不在此班名單" }, { status: 400 })

    const existing = await prisma.lessonRecord.findFirst({
      where:  { homeworkId: ok.hw.id, studentId, kind: { in: [...HOMEWORK_KINDS] } },
      select: { id: true, kind: true, authorId: true, resolved: true },
    })
    const target = status === "MISSING" ? "MISSING_HOMEWORK" : status === "ABSENT" ? "HOMEWORK_ABSENT" : null
    if ((existing?.kind ?? null) === target) {
      return NextResponse.json({ outcomes: await outcomes(ok.hw.id, me) })
    }
    if (existing && !ok.teacher && (existing.authorId !== me || existing.resolved)) {
      return NextResponse.json({
        error: existing.resolved ? "老師已跟進，不可以更改" : "由其他人記錄，只有老師可以更改",
      }, { status: 403 })
    }

    // A teacher marking it in class ties it to that lesson; a rep collecting
    // at recess records it on the day, outside any lesson.
    const lesson = ok.teacher && parsed.data.sessionId
      ? await prisma.classroomSession.findFirst({
          where: { id: parsed.data.sessionId, classId: params.classId }, select: { id: true, date: true, period: true },
        })
      : null

    await prisma.$transaction(async (tx) => {
      if (existing) await tx.lessonRecord.delete({ where: { id: existing.id } })
      if (target) {
        await tx.lessonRecord.create({
          data: {
            classId: params.classId, studentId, kind: target, homeworkId: ok.hw.id,
            sessionId: lesson?.id ?? null, date: lesson?.date ?? hkDayStart(hkYmd()),
            period: lesson?.period || null, subject: ok.hw.subject, authorId: me,
          },
        })
      }
    })

    if (!ok.teacher && target === "MISSING_HOMEWORK") await tellTeacher(ok.hw, params.classId)
    return NextResponse.json({ outcomes: await outcomes(ok.hw.id, me) })
  } catch (err) {
    const msg = dbErrorMessage(err)
    console.error("[homework outcome PUT]", err)
    return NextResponse.json({ error: msg ?? "未能更新" }, { status: msg ? 503 : 500 })
  }
}

/**
 * Let the teacher know a rep is recording 欠交 — once per homework per day,
 * kept up to date, rather than one notification per tap.
 */
async function tellTeacher(
  hw: { id: string; title: string; byRole: string; recordedBy: string; class: { name: string; teacherId: string; homeroomTeacherId: string | null } },
  classId: string,
) {
  try {
    const to = hw.byRole === "TEACHER"
      ? [hw.recordedBy]
      : Array.from(new Set([hw.class.teacherId, hw.class.homeroomTeacherId].filter((x): x is string => !!x)))
    const missing = await prisma.lessonRecord.count({ where: { homeworkId: hw.id, kind: "MISSING_HOMEWORK" } })
    const title = `課代表收功課：${hw.class.name} ${hw.title}`
    const body  = `目前 ${missing} 人欠交`
    const link  = `/teacher/classroom/${classId}`
    const since = hkDayStart(hkYmd())

    const fresh: string[] = []
    for (const userId of to) {
      const prev = await prisma.notification.findFirst({ where: { userId, title, createdAt: { gte: since } }, select: { id: true } })
      if (prev) await prisma.notification.update({ where: { id: prev.id }, data: { body, read: false } })
      else fresh.push(userId)
    }
    if (fresh.length) await notifyMany(fresh, { type: "GENERAL", title, body, link })
  } catch (err) {
    console.error("[homework outcome] notify failed", err)
  }
}
