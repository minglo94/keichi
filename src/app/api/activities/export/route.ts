import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { toCsv, csvResponse } from "@/lib/csv"

// GET — export the current teacher's activities (with attendance counts) as CSV.
export async function GET() {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const activities = await prisma.activity.findMany({
    where:   { createdById: session.user.id },
    include: {
      _count:      { select: { assignments: true } },
      assignments: { where: { status: "CONFIRMED" }, select: { id: true } },
    },
    orderBy: { startTime: "asc" },
  })

  const csv = toCsv(
    ["活動名稱", "地點", "委員會", "開始時間", "結束時間", "已分派", "已確認"],
    activities.map((a) => [
      a.title,
      a.location ?? "",
      a.committee ?? "",
      new Date(a.startTime).toLocaleString("zh-HK"),
      a.endTime ? new Date(a.endTime).toLocaleString("zh-HK") : "",
      a._count.assignments,
      a.assignments.length,
    ])
  )

  return csvResponse(csv, "activities.csv")
}
