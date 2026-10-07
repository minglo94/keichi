import { getTeacherLessons, periodLabelOf, WEEKDAY_NAMES, MAX_DAY } from "@/lib/agent-timetable"
import { loadClashContext, toMinutes, type ClashContext } from "@/lib/pd-clash"
import { resolveAgainstTimetable } from "@/lib/teacher-match"
import { hkHm, hkWeekday, hkYmd } from "@/lib/hk-date"

// 「現在邊一堂」 — the first thing in the codebase that maps *now* onto a period.
//
// Every distinct way of not knowing gets its own `kind`. The rule pd-clash.ts
// established applies here too: "we don't know" must never be rendered as a
// confident answer. A teacher whose account doesn't resolve against the
// timetable must see 找不到你的時間表, not an empty 課堂 that reads as "you
// have no lesson now".

export type LessonRef = {
  dayOfWeek:   number
  period:      number          // 0 for a named slot
  periodLabel: string | null
  label:       string          // 「第3節」 or 「周會」
  classCode:   string | null
  subject:     string | null
  startTime:   string | null   // null when SchoolPeriod has no row for this slot
  endTime:     string | null
}

export type CurrentLesson =
  | { kind: "now";              date: string; lesson: LessonRef; next: LessonRef | null; note: string }
  | { kind: "next";             date: string; next: LessonRef; reason: "before-school" | "between-periods"; note: string }
  | { kind: "done-for-day";     date: string; lessonsToday: LessonRef[]; note: string }
  | { kind: "no-lessons-today"; date: string; reason: string }
  | { kind: "not-teaching-day"; date: string; reason: string }
  | { kind: "unknown-slot";     date: string; lesson: LessonRef; reason: string }
  | { kind: "no-teacher-match"; date: string; tried: string[] }
  | { kind: "no-timetable";     date: string }
  | { kind: "not-configured";   date: string }

export type TeacherNames = { name: string | null; nameEn: string | null; timetableName: string | null }

export async function getCurrentLesson(
  user: TeacherNames,
  opts: { now?: Date; ctx?: ClashContext } = {},
): Promise<CurrentLesson> {
  const now  = opts.now ?? new Date()
  const date = hkYmd(now)
  const ctx  = opts.ctx ?? await loadClashContext()

  // Without clock times nothing can be compared. DEFAULT_PERIODS is a seed for
  // the settings form, not school truth — never fall back to it here.
  if (!ctx.configured) return { kind: "not-configured", date }
  if (!ctx.term || ctx.timetableNames.length === 0) return { kind: "no-timetable", date }

  const match = resolveAgainstTimetable(user, ctx.timetableNames)
  if (!match.ok) return { kind: "no-teacher-match", date, tried: match.tried }

  // Same precedence as pd-clash: a holiday or exam cancels the timetable; a
  // 學校活動 (EVENT) does not — lessons still run, so it rides along as a note.
  const day    = new Date(`${date}T12:00:00+08:00`)
  const covers = ctx.nonTeaching.filter((n) => day >= n.startDate && day <= n.endDate)
  const cover  = covers.find((n) => n.type !== "EVENT")
  const event  = covers.find((n) => n.type === "EVENT")
  const note   = event ? `${event.name}（學校活動，照常上課）` : ""
  if (cover) {
    return { kind: "not-teaching-day", date, reason: cover.type === "EXAM" ? `${cover.name}（考試期）` : cover.name }
  }

  const wd = hkWeekday(date)
  if (wd < 1 || wd > MAX_DAY) return { kind: "no-lessons-today", date, reason: "星期六／日" }

  const lessons = await getTeacherLessons(match.timetableName, ctx.term, wd)
  if (lessons.length === 0) {
    return { kind: "no-lessons-today", date, reason: `星期${WEEKDAY_NAMES[wd]}無課${note ? ` · ${note}` : ""}` }
  }

  // Numbered periods take their times by number; named slots (早會/周會) by
  // label. Label, not time: 周會 sits inside 第8節, so time alone is ambiguous.
  const refs: LessonRef[] = lessons.map((l) => {
    const slot = l.period === 0
      ? ctx.periods.find((p) => p.period === null && p.label === l.periodLabel)
      : ctx.periods.find((p) => p.period === l.period)
    return {
      dayOfWeek: l.dayOfWeek, period: l.period, periodLabel: l.periodLabel,
      label: periodLabelOf(l), classCode: l.classCode, subject: l.subject,
      startTime: slot?.startTime ?? null, endTime: slot?.endTime ?? null,
    }
  })

  // Clock order for display — named slots are stored as period 0, which would
  // otherwise list 周會 before 第1節.
  refs.sort((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99") || a.period - b.period)

  return classifyLessons(refs, toMinutes(hkHm(now))!, date, note)
}


/**
 * Pure: given today's lessons with their clock times, decide which one is on
 * at `nowMin` (minutes since midnight, HK). Split out so the timing rules —
 * especially the 周會-inside-第8節 overlap — are testable without a database.
 */
export function classifyLessons(
  refs: LessonRef[],
  nowMin: number,
  date: string,
  note = "",
): Extract<CurrentLesson, { kind: "now" | "next" | "done-for-day" | "unknown-slot" }> {
  const span = (r: LessonRef) => {
    const s = r.startTime ? toMinutes(r.startTime) : null
    const e = r.endTime ? toMinutes(r.endTime) : null
    return s !== null && e !== null && e > s ? { s, e } : null
  }
  const timed = refs
    .map((r) => ({ r, w: span(r) }))
    .filter((x): x is { r: LessonRef; w: { s: number; e: number } } => x.w !== null)
    .sort((a, b) => a.w.s - b.w.s || a.w.e - b.w.e)

  if (timed.length === 0) {
    return { kind: "unknown-slot", date, lesson: refs[0], reason: "此節未設定時間，請自行確認" }
  }

  // Half-open, matching overlaps() in clash.ts. Several containing windows means
  // a named slot overlaps a period (周會 14:10–14:20 inside 第8節 14:10–14:45):
  // the narrowest wins, because that slot exists precisely to displace the period.
  const containing = timed
    .filter((x) => x.w.s <= nowMin && nowMin < x.w.e)
    .sort((a, b) => (a.w.e - a.w.s) - (b.w.e - b.w.s) || (a.r.period === 0 ? -1 : 1))
  if (containing.length > 0) {
    const cur  = containing[0]
    const next = timed.find((x) => x.w.s >= cur.w.e)?.r ?? null
    return { kind: "now", date, lesson: cur.r, next, note }
  }

  const upcoming = timed.find((x) => x.w.s > nowMin)
  if (upcoming) {
    return {
      kind: "next", date, next: upcoming.r, note,
      reason: nowMin < timed[0].w.s ? "before-school" : "between-periods",
    }
  }
  return { kind: "done-for-day", date, lessonsToday: refs, note }
}
