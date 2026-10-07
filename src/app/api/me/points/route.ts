import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { dbErrorMessage } from "@/lib/db-error"

// GET — 我的積點記錄: the student's own point transactions, newest first, plus a
// total per class. Strictly the caller's own rows — no other student's points
// are reachable from here (the class leaderboard is a separate, existing view).
export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== "STUDENT") {
    return NextResponse.json({ error: "Students only" }, { status: 403 })
  }
  const me = session.user.id
  try {
    const [history, totals] = await Promise.all([
      prisma.pointTransaction.findMany({
        where:   { userId: me },
        select:  { id: true, amount: true, reason: true, note: true, createdAt: true, class: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take:    200,
      }),
      prisma.pointTransaction.groupBy({ by: ["classId"], where: { userId: me }, _sum: { amount: true } }),
    ])
    const names = new Map(history.map((h) => [h.class.id, h.class.name]))
    const missing = totals.filter((t) => !names.has(t.classId)).map((t) => t.classId)
    if (missing.length) {
      for (const c of await prisma.class.findMany({ where: { id: { in: missing } }, select: { id: true, name: true } })) names.set(c.id, c.name)
    }
    return NextResponse.json({
      history,
      totals: totals.map((t) => ({ classId: t.classId, className: names.get(t.classId) ?? "", total: t._sum.amount ?? 0 })),
    })
  } catch (err) {
    const msg = dbErrorMessage(err)
    return NextResponse.json({ error: msg ?? "未能載入積點記錄" }, { status: msg ? 503 : 500 })
  }
}
