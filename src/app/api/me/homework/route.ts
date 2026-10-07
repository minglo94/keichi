import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { subjectsAllow } from "@/lib/class-rep"
import { hkDayStart, hkYmd } from "@/lib/hk-date"
import { dbErrorMessage } from "@/lib/db-error"

// GET — 我的課堂: homework for every class the student is in, recent first.
//
// Scoped to the caller's own enrollments. Each item says whether *this*
// student has been recorded as missing it (their own data only), and — for a
// 課代表 — whether they can 收功課 on it. Classmates' records are never here.
export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== "STUDENT") {
    return NextResponse.json({ error: "Students only" }, { status: 403 })
  }
  const me = session.user.id
  try {
    const enrollments = await prisma.classEnrollment.findMany({
      where:  { studentId: me },
      select: { class: { select: { id: true, name: true } } },
      orderBy: { class: { name: "asc" } },
    })
    const classIds = enrollments.map((e) => e.class.id)

    // Recent and current homework: anything still due, plus the last 3 weeks.
    const since = new Date(hkDayStart(hkYmd()).getTime() - 21 * 24 * 3600_000)
    const [reps, homework, myMisses] = await Promise.all([
      prisma.classRep.findMany({ where: { studentId: me, classId: { in: classIds } }, select: { classId: true, subject: true } }),
      prisma.homework.findMany({
        where: {
          classId: { in: classIds },
          OR: [{ assignedOn: { gte: since } }, { dueDate: { gte: hkDayStart(hkYmd()) } }],
        },
        select: {
          id: true, classId: true, subject: true, title: true, detail: true,
          assignedOn: true, dueDate: true, byRole: true, confirmedAt: true, recordedBy: true,
          recorder: { select: { name: true } },
        },
        orderBy: [{ dueDate: "asc" }, { assignedOn: "desc" }],
        take: 200,
      }),
      prisma.lessonRecord.findMany({
        where:  { studentId: me, kind: { in: ["MISSING_HOMEWORK", "HOMEWORK_ABSENT"] }, homeworkId: { not: null } },
        select: { homeworkId: true, resolved: true, kind: true },
      }),
    ])

    const repBy = new Map<string, string[]>()
    for (const r of reps) repBy.set(r.classId, [...(repBy.get(r.classId) ?? []), r.subject])
    const missed = new Map(myMisses.map((m) => [m.homeworkId!, m]))

    const classes = enrollments.map(({ class: c }) => {
      const subjects = repBy.get(c.id) ?? null
      return {
        id: c.id, name: c.name,
        repSubjects: subjects,
        homework: homework.filter((h) => h.classId === c.id).map((h) => ({
          id: h.id, subject: h.subject, title: h.title, detail: h.detail,
          assignedOn: h.assignedOn, dueDate: h.dueDate,
          byRep: h.byRole === "REP", recorderName: h.recorder.name,
          confirmed: !!h.confirmedAt,
          mine: h.recordedBy === me,
          // This student's own outcome only: 欠交, or 缺席 (absent that day, still owes it).
          iMissed: missed.has(h.id)
            ? { absent: missed.get(h.id)!.kind === "HOMEWORK_ABSENT", followedUp: missed.get(h.id)!.resolved }
            : null,
          canCollect: subjectsAllow(subjects, h.subject),
        })),
      }
    })

    return NextResponse.json({ classes })
  } catch (err) {
    const msg = dbErrorMessage(err)
    console.error("[me/homework]", err)
    return NextResponse.json({ error: msg ?? "未能載入功課" }, { status: msg ? 503 : 500 })
  }
}
