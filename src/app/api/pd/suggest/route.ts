import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { pdSession } from "@/lib/pd-auth"
import { checkManyPdClashes, datesInRange, loadClashContext } from "@/lib/pd-clash"
import { hkSchoolYear } from "@/lib/hk-date"
import { z } from "zod"

// POST — 建議人選: who could attend a workshop in this window.
//
// Flips the 申請 question round ("who is free?" instead of "is X free?"), with
// an optional 科組 / 委員會 filter. It only ever suggests — filing and
// approving still go through the normal form.

const schema = z.object({
  startDate:  z.string(),
  endDate:    z.string().optional(),
  startTime:  z.string(),
  endTime:    z.string(),
  department: z.string().optional(),
  committee:  z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await pdSession()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const d = schema.parse(await req.json())
  const dates = datesInRange(d.startDate, d.endDate || d.startDate)
  if (dates.length === 0) return NextResponse.json({ error: "日期範圍無效" }, { status: 400 })

  const [staff, ctx] = await Promise.all([
    prisma.user.findMany({
      where:  { role: { in: ["TEACHER", "ADMIN"] } },
      select: { id: true, name: true, nameEn: true, email: true, departments: true, committees: true, timetableName: true },
      take:   500,
    }),
    loadClashContext(),
  ])

  // 科組 falls back to what the teacher actually teaches on the timetable.
  // 教師資料 is new and mostly empty, so without this the filter would match
  // nobody and the feature would look broken on day one.
  const subjectRows = ctx.term
    ? await prisma.agentTimetable.findMany({
        where:  { term: ctx.term, subject: { not: null } },
        select: { teacherName: true, subject: true },
        distinct: ["teacherName", "subject"],
      })
    : []
  const taughtSubjects = new Map<string, string[]>()
  for (const r of subjectRows) {
    if (!r.subject) continue
    const list = taughtSubjects.get(r.teacherName) ?? []
    list.push(r.subject)
    taughtSubjects.set(r.teacherName, list)
  }

  const results = await checkManyPdClashes({
    teachers: staff, dates, startTime: d.startTime, endTime: d.endTime, ctx,
  })
  const byId = new Map(results.map((r) => [r.teacherId, r]))

  // 已申請次數 this school year (Sep–Aug), so the same person isn't picked
  // every time just because they happen to be free.
  const { start, end } = hkSchoolYear()
  const counts = await prisma.pdApplication.groupBy({
    by:     ["teacherId"],
    where:  { status: { in: ["PENDING", "APPROVED"] }, startDate: { gte: start, lte: end } },
    _count: { _all: true },
  })
  const pdCount = new Map(counts.map((c) => [c.teacherId, c._count._all]))

  const dept = d.department?.trim()
  const cmte = d.committee?.trim()

  const candidates = staff.map((t) => {
    const r        = byId.get(t.id)!
    const subjects = Array.from(new Set([
      ...t.departments,
      ...(r.resolved ? taughtSubjects.get(r.resolved) ?? [] : []),
    ]))
    return {
      id: t.id, name: t.name, nameEn: t.nameEn, email: t.email,
      subjects,
      committees: t.committees,
      resolved:   r.resolved,
      clashDates: r.clashDates,
      lessons:    r.lessons,
      notConfigured: r.checks.some((c) => c.kind === "not-configured"),
      pdCount:    pdCount.get(t.id) ?? 0,
    }
  }).filter((c) =>
    (!dept || c.subjects.includes(dept)) &&
    (!cmte || c.committees.includes(cmte)))

  // A teacher with no timetable row has zero clashes, so a naive sort would
  // rank them as the ideal candidate. They go in their own bucket instead —
  // "we don't know" must never be presented as "free".
  const unknown = candidates.filter((c) => !c.resolved)
  const known   = candidates.filter((c) => c.resolved)

  const free    = known.filter((c) => c.clashDates === 0)
    .sort((a, b) => a.pdCount - b.pdCount || (a.name ?? "").localeCompare(b.name ?? ""))
  const partial = known.filter((c) => c.clashDates > 0)
    .sort((a, b) => a.clashDates - b.clashDates || a.lessons.length - b.lessons.length || a.pdCount - b.pdCount)

  return NextResponse.json({
    dates,
    notConfigured: !ctx.configured,
    term: ctx.term,
    free, partial, unknown,
    // So the UI can say "N 位教師未填科組" rather than silently showing fewer.
    missingProfile: staff.filter((t) => t.departments.length === 0 && t.committees.length === 0).length,
    total: staff.length,
  })
}
