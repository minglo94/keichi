import { prisma } from "@/lib/prisma"
import { getAllTeachers, getLatestTerm, MAX_DAY, MAX_PERIOD } from "@/lib/agent-timetable"
import { resolveAgainstTimetable } from "@/lib/teacher-match"

// 共同空堂 — the grid version of what Keida answers in prose.
//
// Same question as the agent's timetable_query tool, but for a group picked by
// 科組／委員會 on the 教師進修 page, and returning *who* is busy in each slot
// rather than just whether anyone is.

export type SlotTeacher = {
  id: string
  name: string | null
  nameEn: string | null
  timetableName: string | null
}

export type CommonFreeResult = {
  term: string | null
  periods: { period: number | null; label: string | null; startTime: string; endTime: string }[]
  /** Teachers whose account matched a timetable name. */
  resolved: { id: string; name: string | null; timetableName: string }[]
  /**
   * Teachers with no timetable row. Reported separately and never counted as
   * free — an unmatched name has no lessons, so including them would make every
   * slot look open.
   */
  unresolved: { id: string; name: string | null }[]
  /** busy[day][period] = teacher ids teaching then. day 1-5, period 1-MAX_PERIOD. */
  busy: Record<string, string[]>
}

export const slotKey = (day: number, period: number) => `${day}-${period}`

export async function commonFreeSlots(teachers: SlotTeacher[]): Promise<CommonFreeResult> {
  const [term, periods] = await Promise.all([
    getLatestTerm(),
    prisma.schoolPeriod.findMany({ orderBy: [{ period: "asc" }, { startTime: "asc" }] }),
  ])

  const empty: CommonFreeResult = {
    term, periods, resolved: [], unresolved: teachers.map((t) => ({ id: t.id, name: t.name })), busy: {},
  }
  if (!term || teachers.length === 0) return empty

  const names = await getAllTeachers(term)

  const resolved:   CommonFreeResult["resolved"]   = []
  const unresolved: CommonFreeResult["unresolved"] = []
  const idsByName = new Map<string, string[]>()
  for (const t of teachers) {
    const m = resolveAgainstTimetable(t, names)
    if (!m.ok) { unresolved.push({ id: t.id, name: t.name }); continue }
    resolved.push({ id: t.id, name: t.name, timetableName: m.timetableName })
    // Two accounts could resolve to the same timetable name; keep both ids.
    idsByName.set(m.timetableName, [...(idsByName.get(m.timetableName) ?? []), t.id])
  }

  if (resolved.length === 0) return { ...empty, resolved, unresolved }

  const rows = await prisma.agentTimetable.findMany({
    where:  { term, teacherName: { in: Array.from(idsByName.keys()) } },
    select: { teacherName: true, dayOfWeek: true, period: true },
  })

  const busy: Record<string, string[]> = {}
  for (const r of rows) {
    // period 0 is a named slot (早會/周會) — it has no column in the grid.
    if (r.period < 1 || r.period > MAX_PERIOD) continue
    if (r.dayOfWeek < 1 || r.dayOfWeek > MAX_DAY) continue
    const key = slotKey(r.dayOfWeek, r.period)
    const ids = busy[key] ?? []
    for (const id of idsByName.get(r.teacherName) ?? []) {
      if (!ids.includes(id)) ids.push(id)
    }
    busy[key] = ids
  }

  return { term, periods, resolved, unresolved, busy }
}
