import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isTeacherOrAdmin } from "@/lib/roles"
import { requireSessionAccess } from "@/lib/class-perm"
import { dbErrorMessage } from "@/lib/db-error"
import { RECORD_KINDS } from "@/lib/lesson-records"
import { z } from "zod"

type Params = { params: { id: string } }

const RECORD_SELECT = {
  id: true, studentId: true, kind: true, tag: true, note: true, points: true,
  homeworkId: true, awardedAt: true, resolved: true, createdAt: true,
  homework: { select: { id: true, title: true } },
} as const

// GET — everything recorded in this lesson.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const gate = await requireSessionAccess(params.id, session.user)
  if (gate instanceof NextResponse) return gate
  try {
    const records = await prisma.lessonRecord.findMany({
      where: { sessionId: params.id }, select: RECORD_SELECT, orderBy: { createdAt: "asc" },
    })
    return NextResponse.json({ records })
  } catch (err) {
    const msg = dbErrorMessage(err)
    return NextResponse.json({ error: msg ?? "未能載入紀錄" }, { status: msg ? 503 : 500 })
  }
}

const schema = z.object({
  kind:       z.enum(RECORD_KINDS),
  studentIds: z.array(z.string().min(1)).min(1).max(60),
  tag:        z.string().trim().max(30).optional(),
  note:       z.string().trim().max(300).optional(),
  points:     z.number().int().min(-5).max(5).optional(),
  homeworkId: z.string().optional(),
})

// POST — record one thing for one or more students in this lesson.
//
// The rules that keep a quick-tap UI honest:
//  - 缺席 and 遲到 are the same question (were they here on time?), so setting
//    one replaces the other, and repeating it changes nothing.
//  - 欠交 the same homework is recorded once per student, however many lessons
//    it is noted in.
//  - 欠帶書本 and 課堂表現 can legitimately happen several times.
export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const gate = await requireSessionAccess(params.id, session.user)
  if (gate instanceof NextResponse) return gate
  const { session: lesson } = gate

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "資料不完整" }, { status: 400 })
  const d = parsed.data

  if (d.kind === "PERFORMANCE" && !d.points) {
    return NextResponse.json({ error: "課堂表現需要分數（例如 +1 或 −1）" }, { status: 400 })
  }
  if ((d.kind === "MISSING_HOMEWORK" || d.kind === "HOMEWORK_ABSENT") && !d.homeworkId) {
    return NextResponse.json({ error: "請揀選哪一份功課" }, { status: 400 })
  }

  try {
    // Only students on this class's roster can be recorded against it.
    const enrolled = await prisma.classEnrollment.findMany({
      where:  { classId: lesson.classId, studentId: { in: d.studentIds } },
      select: { studentId: true },
    })
    const ids = enrolled.map((e) => e.studentId)
    if (ids.length === 0) return NextResponse.json({ error: "學生不在此班名單" }, { status: 400 })

    if (d.homeworkId) {
      const hw = await prisma.homework.findFirst({ where: { id: d.homeworkId, classId: lesson.classId }, select: { id: true } })
      if (!hw) return NextResponse.json({ error: "找不到此功課" }, { status: 404 })
    }

    let skip = new Set<string>()
    if (d.kind === "ABSENT" || d.kind === "LATE") {
      const other = d.kind === "ABSENT" ? "LATE" : "ABSENT"
      await prisma.lessonRecord.deleteMany({ where: { sessionId: lesson.id, studentId: { in: ids }, kind: other } })
      const existing = await prisma.lessonRecord.findMany({
        where: { sessionId: lesson.id, studentId: { in: ids }, kind: d.kind }, select: { studentId: true },
      })
      skip = new Set(existing.map((e) => e.studentId))
    }
    if (d.kind === "MISSING_HOMEWORK" || d.kind === "HOMEWORK_ABSENT") {
      // 欠交 and 缺席未交 are one question per homework (did they hand it in?),
      // so setting one replaces the other.
      const other = d.kind === "MISSING_HOMEWORK" ? "HOMEWORK_ABSENT" : "MISSING_HOMEWORK"
      await prisma.lessonRecord.deleteMany({ where: { homeworkId: d.homeworkId, studentId: { in: ids }, kind: other } })
      const existing = await prisma.lessonRecord.findMany({
        where: { homeworkId: d.homeworkId, studentId: { in: ids }, kind: d.kind }, select: { studentId: true },
      })
      skip = new Set(existing.map((e) => e.studentId))
    }

    const toCreate = ids.filter((id) => !skip.has(id))
    await prisma.lessonRecord.createMany({
      data: toCreate.map((studentId) => ({
        sessionId: lesson.id, classId: lesson.classId, studentId, kind: d.kind,
        date: lesson.date, period: lesson.period || null, subject: lesson.subject,
        tag: d.tag || null, note: d.note || null,
        points: d.kind === "PERFORMANCE" ? d.points! : 0,
        homeworkId: d.kind === "MISSING_HOMEWORK" || d.kind === "HOMEWORK_ABSENT" ? d.homeworkId : null,
        authorId: session.user.id,
      })),
    })

    const records = await prisma.lessonRecord.findMany({
      where: { sessionId: lesson.id }, select: RECORD_SELECT, orderBy: { createdAt: "asc" },
    })
    return NextResponse.json({
      created: toCreate.length,
      alreadyRecorded: skip.size,
      notInClass: d.studentIds.length - ids.length,
      records,
    }, { status: 201 })
  } catch (err) {
    const msg = dbErrorMessage(err)
    console.error("[session records POST]", err)
    return NextResponse.json({ error: msg ?? "未能記錄" }, { status: msg ? 503 : 500 })
  }
}
