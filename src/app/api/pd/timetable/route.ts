import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { pdSession } from "@/lib/pd-auth"
import { getAllTeachers, getLatestTerm } from "@/lib/agent-timetable"
import { resolveAgainstTimetable } from "@/lib/teacher-match"
import { hkSchoolYear } from "@/lib/hk-date"

// GET ?teacherId= — the teacher's own timetable for 板面 2, generated from the
// uploaded CSV rather than a per-teacher PDF link, so it can never disagree
// with what the clash checker uses.
//
// It also returns the 科組/委員會 card shown when you click the name, and how
// many PD applications the teacher already has this school year — the thing a
// clash check can't tell you when deciding who to send.
export async function GET(req: NextRequest) {
  const session = await pdSession()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const teacherId = new URL(req.url).searchParams.get("teacherId")
  if (!teacherId) return NextResponse.json({ error: "缺少 teacherId" }, { status: 400 })

  const teacher = await prisma.user.findUnique({
    where:  { id: teacherId },
    select: {
      id: true, name: true, nameEn: true, email: true,
      departments: true, committees: true, timetableName: true,
    },
  })
  if (!teacher) return NextResponse.json({ error: "找不到教師" }, { status: 404 })

  // School year runs Sep–Aug, so a count "this year" must not reset in January.
  const { start, end } = hkSchoolYear()
  const [pdCount, term] = await Promise.all([
    prisma.pdApplication.count({
      where: { teacherId, status: { in: ["PENDING", "APPROVED"] }, startDate: { gte: start, lte: end } },
    }),
    getLatestTerm(),
  ])

  const profile = {
    id: teacher.id, name: teacher.name, nameEn: teacher.nameEn, email: teacher.email,
    departments: teacher.departments, committees: teacher.committees,
    pdCount,
  }

  if (!term) {
    return NextResponse.json({ term: null, matched: null, lessons: [], periods: [], profile })
  }

  // Resolve exactly the way the clash checker does. This route used to call
  // matchTeacher(teacher.name) on its own, so the 資料 tab could report
  // 找不到時間表 for a teacher the 申請 tab resolved fine — same question, two
  // answers.
  const match = resolveAgainstTimetable(teacher, await getAllTeachers(term))
  if (!match.ok) {
    return NextResponse.json({ term, matched: null, tried: match.tried, lessons: [], periods: [], profile })
  }

  const [lessons, periods] = await Promise.all([
    prisma.agentTimetable.findMany({
      where:   { teacherName: match.timetableName, term },
      select:  { dayOfWeek: true, period: true, periodLabel: true, classCode: true, subject: true },
      orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
    }),
    prisma.schoolPeriod.findMany({ orderBy: [{ period: "asc" }, { startTime: "asc" }] }),
  ])

  return NextResponse.json({ term, matched: match.timetableName, via: match.via, lessons, periods, profile })
}
