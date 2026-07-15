import { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin, isAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { toCsv, csvResponse } from "@/lib/csv"
import { BEHAVIOR_LABEL } from "@/lib/discipline"

// GET — export behavior records as CSV.
// Discipline committee + admins export all; other teachers export their own.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const type = new URL(req.url).searchParams.get("type") || undefined

  let staff = isAdmin(session.user.role)
  if (!staff) {
    const r = await prisma.committeeRole.findFirst({ where: { userId: session.user.id, committee: "DISCIPLINE" } })
    staff = !!r
  }

  const records = await prisma.behaviorRecord.findMany({
    where: {
      ...(staff ? {} : { authorId: session.user.id }),
      ...(type ? { type: type as "MERIT" | "MISCONDUCT" | "DEMERIT" | "MINOR_FAULT" | "MAJOR_FAULT" | "LATE" | "ABSENT" } : {}),
    },
    orderBy: { date: "desc" },
  })

  const csv = toCsv(
    ["日期", "班別", "學生", "類別", "描述", "跟進行動", "已處理"],
    records.map((r) => [
      new Date(r.date).toLocaleDateString("zh-HK"),
      r.className,
      r.studentName,
      BEHAVIOR_LABEL[r.type],
      r.description,
      r.action ?? "",
      r.resolved ? "是" : "否",
    ])
  )

  return csvResponse(csv, "behavior-records.csv")
}
