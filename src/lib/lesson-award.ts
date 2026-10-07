import { prisma } from "@/lib/prisma"
import { broadcastPointsAwarded } from "@/lib/pusher"
import { notifyMany } from "@/lib/notify"
import { formEnrollment, isFormClassName } from "@/lib/form-class"
import { summariseTags } from "@/lib/lesson-records"

// 課堂表現 → 積點.
//
// Performance is recorded as pending LessonRecord rows during the lesson (free
// to edit or delete), and paid out here in one deliberate step. Each student
// gets ONE PointTransaction per award — the net of their pending rows — and
// every contributing row is stamped with it, so 撤回 deletes exactly what was
// paid instead of inserting a negative row the student would see forever.
//
// Points rank by form class (confirmed with the user): in a teaching group
// (中四物理選修) each student's points go to their own form class, so they show
// on that class's leaderboard. A student with no form class can't be paid and
// is reported by name — never silently skipped.

export type AwardResult = {
  awarded:   { studentId: string; name: string | null; amount: number; classId: string }[]
  netZero:   number    // students whose rows cancelled out: settled, nothing paid
  skipped:   { studentId: string; name: string | null; reason: string }[]
}

export async function awardSession(sessionId: string, teacherId: string): Promise<AwardResult> {
  const session = await prisma.classroomSession.findUniqueOrThrow({
    where:  { id: sessionId },
    select: { id: true, classId: true, subject: true, date: true, class: { select: { name: true } } },
  })

  const pending = await prisma.lessonRecord.findMany({
    where:  { sessionId, kind: "PERFORMANCE", awardedAt: null },
    select: { id: true, studentId: true, points: true, tag: true },
  })
  const result: AwardResult = { awarded: [], netZero: 0, skipped: [] }
  if (pending.length === 0) return result

  const studentIds = Array.from(new Set(pending.map((r) => r.studentId)))
  const students = await prisma.user.findMany({
    where:  { id: { in: studentIds } },
    select: {
      id: true, name: true,
      enrollments: { select: { classNumber: true, class: { select: { id: true, name: true } } } },
    },
  })
  const byId = new Map(students.map((s) => [s.id, s]))
  const sessionIsForm = isFormClassName(session.class.name)

  const now = new Date()
  const zeroRowIds: string[] = []
  const plan: { studentId: string; amount: number; classId: string; rowIds: string[]; note: string }[] = []

  for (const sid of studentIds) {
    const rows   = pending.filter((r) => r.studentId === sid)
    const amount = rows.reduce((n, r) => n + r.points, 0)
    const st     = byId.get(sid)

    if (amount === 0) {
      // Nothing to pay, but the rows are settled — otherwise they'd sit
      // "pending" forever and be re-summed on every award.
      zeroRowIds.push(...rows.map((r) => r.id))
      result.netZero++
      continue
    }

    const targetClassId = sessionIsForm
      ? session.classId
      : formEnrollment(st?.enrollments ?? [])?.class.id
    if (!targetClassId) {
      result.skipped.push({ studentId: sid, name: st?.name ?? null, reason: "未有所屬班別，未能發放" })
      continue
    }

    // 「課堂表現：主動發問 ×2、答得好（3A 中文）」 — what the student sees in 積點記錄.
    const where = [session.class.name, session.subject].filter(Boolean).join(" ")
    const note  = `課堂表現：${summariseTags(rows.map((r) => r.tag)) || "表現"}（${where}）`
    plan.push({ studentId: sid, amount, classId: targetClassId, rowIds: rows.map((r) => r.id), note })
  }

  // Create the transactions and stamp their ids back, atomically: a failure
  // half way must not leave points paid with rows still "pending".
  await prisma.$transaction(async (tx) => {
    for (const op of plan) {
      const pt = await tx.pointTransaction.create({
        data: {
          userId: op.studentId, classId: op.classId, amount: op.amount,
          reason: "TEACHER", awardedBy: teacherId, note: op.note.slice(0, 190),
        },
      })
      await tx.lessonRecord.updateMany({
        where: { id: { in: op.rowIds } },
        data:  { awardedAt: now, pointTxId: pt.id },
      })
      result.awarded.push({ studentId: op.studentId, name: byId.get(op.studentId)?.name ?? null, amount: op.amount, classId: op.classId })
    }
    if (zeroRowIds.length) {
      await tx.lessonRecord.updateMany({ where: { id: { in: zeroRowIds } }, data: { awardedAt: now } })
    }
  })

  // Live update + a durable notification. Best-effort: the points are already
  // paid, so a Pusher hiccup must not turn into an error for the teacher.
  for (const a of result.awarded) {
    try {
      const total = await prisma.pointTransaction.aggregate({ where: { userId: a.studentId, classId: a.classId }, _sum: { amount: true } })
      await broadcastPointsAwarded(a.classId, {
        userId: a.studentId, amount: a.amount, reason: "TEACHER",
        totalPoints: total._sum.amount ?? 0, note: "課堂表現",
      })
    } catch (err) { console.error("[award] broadcast failed", err) }
  }
  const gained = result.awarded.filter((a) => a.amount > 0).map((a) => a.studentId)
  if (gained.length) {
    await notifyMany(gained, {
      type: "GENERAL", title: "你獲得課堂表現積點",
      body: [session.class.name, session.subject].filter(Boolean).join(" "),
      link: "/student/points",
    })
  }
  return result
}

/**
 * 撤回: delete exactly the transactions this session's award created and put
 * the rows back to pending. No compensating negative row.
 */
export async function withdrawSession(sessionId: string): Promise<{ withdrawn: number; transactions: number }> {
  const rows = await prisma.lessonRecord.findMany({
    where:  { sessionId, kind: "PERFORMANCE", awardedAt: { not: null } },
    select: { id: true, pointTxId: true },
  })
  const txIds = Array.from(new Set(rows.map((r) => r.pointTxId).filter((x): x is string => !!x)))
  await prisma.$transaction([
    prisma.pointTransaction.deleteMany({ where: { id: { in: txIds } } }),
    prisma.lessonRecord.updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data:  { awardedAt: null, pointTxId: null },
    }),
  ])
  return { withdrawn: rows.length, transactions: txIds.length }
}
