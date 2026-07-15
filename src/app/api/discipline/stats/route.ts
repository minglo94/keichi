import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin, isAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { BEHAVIOR_ORDER } from "@/lib/discipline"
import type { BehaviorType } from "@prisma/client"

// GET — per-student behavior counts by category (discipline dashboard).
// Optional ?className= filter. Discipline committee / admin only.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!isAdmin(session.user.role)) {
    const r = await prisma.committeeRole.findFirst({ where: { userId: session.user.id, committee: "DISCIPLINE" } })
    if (!r) return NextResponse.json({ error: "訓育組專屬功能" }, { status: 403 })
  }

  const className = new URL(req.url).searchParams.get("className") || undefined

  const grouped = await prisma.behaviorRecord.groupBy({
    by:    ["className", "studentName", "type"],
    where: className ? { className: { contains: className, mode: "insensitive" } } : {},
    _count: { _all: true },
  })

  // Fold into per-student rows: { className, studentName, counts:{TYPE:n}, total }
  const rows = new Map<string, { className: string; studentName: string; counts: Record<string, number>; total: number }>()
  for (const g of grouped) {
    const key = `${g.className}||${g.studentName}`
    if (!rows.has(key)) {
      rows.set(key, { className: g.className, studentName: g.studentName, counts: {}, total: 0 })
    }
    const row = rows.get(key)!
    row.counts[g.type] = g._count._all
    if (g.type !== "MERIT") row.total += g._count._all // "total" = negative records
  }

  // Distinct class names for the filter dropdown.
  const classes = Array.from(new Set(grouped.map((g) => g.className))).sort()

  return NextResponse.json({
    order:    BEHAVIOR_ORDER as BehaviorType[],
    classes,
    students: Array.from(rows.values()).sort((a, b) => b.total - a.total),
  })
}
