import { prisma } from "@/lib/prisma"
import { MAX_PERIOD } from "@/lib/schedule"

export { MAX_PERIOD }
export const MAX_DAY = 5
export const WEEKDAY_NAMES = ["", "一", "二", "三", "四", "五"]

export interface TimetableRow {
  teacherName: string
  dayOfWeek:   number
  period:      number
  periodLabel: string | null
  classCode:   string | null
  subject:     string | null
}

export interface ParseResult {
  rows:   TimetableRow[]
  errors: { line: number; reason: string }[]
}

export function parseTimetableCsv(text: string): ParseResult {
  const rows:   TimetableRow[] = []
  const errors: ParseResult["errors"] = []

  const lines = text.replace(/^﻿/, "").split(/\r?\n/)
  lines.forEach((line, i) => {
    const trimmed = line.trim()
    if (!trimmed) return
    if (i === 0 && /老師|teacher/i.test(trimmed)) return

    const cols = trimmed.split(",").map((c) => c.trim())
    if (cols.length < 3) {
      errors.push({ line: i + 1, reason: "欄位不足（最少需要：老師,星期,節次）" })
      return
    }
    const [teacherName, dayStr, periodStr, classCode = "", subject = ""] = cols
    const dayOfWeek = parseInt(dayStr, 10)
    const period    = parseInt(periodStr, 10)

    if (!teacherName) { errors.push({ line: i + 1, reason: "老師名稱為空" }); return }
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > MAX_DAY) {
      errors.push({ line: i + 1, reason: `星期必須為 1-${MAX_DAY}（收到「${dayStr}」）` }); return
    }
    // A named slot (周會, 早會…) is a real commitment, so keep it as period 0
    // with its label rather than rejecting the row. Only a blank or an
    // out-of-range NUMBER is an error.
    const isNumeric = /^\d+$/.test(periodStr)
    if (isNumeric && (period < 1 || period > MAX_PERIOD)) {
      errors.push({ line: i + 1, reason: `節次必須為 1-${MAX_PERIOD}（收到「${periodStr}」）` }); return
    }
    if (!isNumeric && !periodStr) {
      errors.push({ line: i + 1, reason: "節次為空" }); return
    }

    rows.push({
      teacherName, dayOfWeek,
      period:      isNumeric ? period : 0,
      periodLabel: isNumeric ? null : periodStr,
      classCode:   classCode || null,
      subject:     subject || null,
    })
  })

  return { rows, errors }
}

export interface TeacherMatch {
  query:       string
  matched?:    string
  candidates?: string[]
  notFound?:   boolean
}

export function matchTeacher(query: string, allTeachers: string[]): TeacherMatch {
  const q = query.replace(/sir|miss|老師|先生|小姐|阿/gi, "").trim()
  const exact = allTeachers.find((t) => t === query || t === q)
  if (exact) return { query, matched: exact }
  if (!q) return { query, notFound: true }
  const partial = allTeachers.filter((t) => t.includes(q) || q.includes(t))
  if (partial.length === 1) return { query, matched: partial[0] }
  if (partial.length > 1)  return { query, candidates: partial }
  return { query, notFound: true }
}

export async function getAllTeachers(term: string): Promise<string[]> {
  const rows = await prisma.agentTimetable.findMany({
    where:    { term },
    select:   { teacherName: true },
    distinct: ["teacherName"],
  })
  return rows.map((r) => r.teacherName)
}

/** SchoolSetting key holding the term every lookup should use. */
export const ACTIVE_TERM_KEY = "timetable.activeTerm"

/**
 * The term all timetable lookups run against.
 *
 * This used to be `orderBy: { term: "desc" }` — a *string* sort over a
 * free-text field. That quietly broke as soon as a term was named in a
 * different style: "2026-2027" sorts BEFORE "2526" ('0' < '5' at the second
 * character), so uploading next year's timetable left the old one in force and
 * both 教師進修 and Ask Keida kept answering from it.
 *
 * The term in use is now an explicit setting, written whenever a timetable is
 * uploaded and changeable by an admin.
 */
export async function getLatestTerm(): Promise<string | null> {
  const setting = await prisma.schoolSetting.findUnique({ where: { key: ACTIVE_TERM_KEY } })
  const pinned  = setting?.value?.trim()
  if (pinned) {
    // Only trust it while it still has rows — a deleted term must not silently
    // make every teacher look free.
    const has = await prisma.agentTimetable.findFirst({ where: { term: pinned }, select: { id: true } })
    if (has) return pinned
  }

  // Nothing pinned (or it was deleted): fall back to the only ordering
  // available, and let the admin correct it on the 時間表 tab.
  const row = await prisma.agentTimetable.findFirst({
    orderBy: { term: "desc" },
    select:  { term: true },
  })
  return row?.term ?? null
}

export async function setActiveTerm(term: string): Promise<void> {
  await prisma.schoolSetting.upsert({
    where:  { key: ACTIVE_TERM_KEY },
    create: { key: ACTIVE_TERM_KEY, value: term },
    update: { value: term },
  })
}

/** Every term held in the timetable, with how much data each has. */
export async function listTerms(): Promise<{ term: string; rows: number; teachers: number }[]> {
  const grouped = await prisma.agentTimetable.groupBy({
    by:     ["term"],
    _count: { _all: true },
  })
  const out = await Promise.all(grouped.map(async (g) => ({
    term:     g.term,
    rows:     g._count._all,
    teachers: (await getAllTeachers(g.term)).length,
  })))
  return out.sort((a, b) => b.term.localeCompare(a.term))
}

export interface FreeSlot { day: number; period: number }

export async function getCommonFreeSlots(teachers: string[], term: string): Promise<FreeSlot[]> {
  const lessons = await prisma.agentTimetable.findMany({
    where:  { term, teacherName: { in: teachers } },
    select: { teacherName: true, dayOfWeek: true, period: true },
  })
  const busy = new Set(lessons.map((l) => `${l.dayOfWeek}-${l.period}`))
  const slots: FreeSlot[] = []
  for (let day = 1; day <= MAX_DAY; day++) {
    for (let period = 1; period <= MAX_PERIOD; period++) {
      if (!busy.has(`${day}-${period}`)) slots.push({ day, period })
    }
  }
  return slots
}

export async function getFreeTeachers(day: number, period: number, term: string): Promise<string[]> {
  const all = await getAllTeachers(term)
  const busyRows = await prisma.agentTimetable.findMany({
    where:  { term, dayOfWeek: day, period },
    select: { teacherName: true },
  })
  const busy = new Set(busyRows.map((r) => r.teacherName))
  return all.filter((t) => !busy.has(t))
}

export function formatSlotsTable(slots: FreeSlot[]): string {
  if (slots.length === 0) return "（無共同空堂）"
  const bySet = new Set(slots.map((s) => `${s.day}-${s.period}`))
  const header  = "| 節次 | " + Array.from({ length: MAX_DAY }, (_, d) => `星期${WEEKDAY_NAMES[d + 1]}`).join(" | ") + " |"
  const divider = "|" + "---|".repeat(MAX_DAY + 1)
  const rows = Array.from({ length: MAX_PERIOD }, (_, p) => {
    const cells = Array.from({ length: MAX_DAY }, (_, d) => bySet.has(`${d + 1}-${p + 1}`) ? "✓" : "")
    return `| 第${p + 1}節 | ${cells.join(" | ")} |`
  })
  return [header, divider, ...rows].join("\n")
}


// ─────────────────────────────────────────────────────────────
// A teacher's actual lessons.
//
// timetable_query returns common FREE slots and free_teachers returns who is
// free — neither can answer 「X 老師星期三要上咩堂」. With no tool for that
// question the model simply invented an answer, so this closes the gap.
// ─────────────────────────────────────────────────────────────

export interface Lesson {
  dayOfWeek:   number
  period:      number
  periodLabel: string | null
  classCode:   string | null
  subject:     string | null
}

export async function getTeacherLessons(
  teacherName: string,
  term: string,
  day?: number,
): Promise<Lesson[]> {
  const rows = await prisma.agentTimetable.findMany({
    where: { teacherName, term, ...(day ? { dayOfWeek: day } : {}) },
    select: { dayOfWeek: true, period: true, periodLabel: true, classCode: true, subject: true },
    orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
  })
  return rows
}

/** "第3節" / "周會" — named slots have no number. */
export function periodLabelOf(l: Pick<Lesson, "period" | "periodLabel">): string {
  return l.periodLabel ?? `第${l.period}節`
}
