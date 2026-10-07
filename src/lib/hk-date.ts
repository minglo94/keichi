// Hong Kong date helpers.
//
// The server runs in UTC but the school works in Asia/Hong_Kong (UTC+8), so
// naive `new Date()` date-maths is wrong for eight hours every evening: at
// 17:00 UTC it is already the next day in Hong Kong. Anything that decides
// "today", "this month" or a reporting window must go through here.

export const HK_TZ = "Asia/Hong_Kong"
const HK_OFFSET_MS = 8 * 60 * 60 * 1000

/** Same instant, shifted so UTC getters read as Hong Kong wall-clock time. */
function toHkParts(d: Date): Date {
  return new Date(d.getTime() + HK_OFFSET_MS)
}

/** "YYYY-MM-DD" for the Hong Kong day containing `d`. */
export function hkYmd(d: Date = new Date()): string {
  return toHkParts(d).toISOString().slice(0, 10)
}

/** HK weekday for a "YYYY-MM-DD": 0 = Sunday … 6 = Saturday. */
export function hkWeekday(ymd: string): number {
  // Noon, so no offset arithmetic can push it across a day boundary.
  return new Date(`${ymd}T12:00:00+08:00`).getUTCDay()
}

/** "HH:MM" wall-clock time in Hong Kong. */
export function hkHm(d: Date = new Date()): string {
  return toHkParts(d).toISOString().slice(11, 16)
}

/** UTC instant of Hong Kong midnight starting the given HK day. */
export function hkDayStart(ymd: string): Date {
  return new Date(`${ymd}T00:00:00+08:00`)
}

/** [start, end) covering one whole Hong Kong month, from any date in it. */
export function hkMonthRange(d: Date = new Date()): { start: Date; end: Date; label: string } {
  const p = toHkParts(d)
  const y = p.getUTCFullYear()
  const m = p.getUTCMonth() // 0-based
  const pad = (n: number) => String(n).padStart(2, "0")
  const start = new Date(`${y}-${pad(m + 1)}-01T00:00:00+08:00`)
  const ny = m === 11 ? y + 1 : y
  const nm = m === 11 ? 0 : m + 1
  const end = new Date(`${ny}-${pad(nm + 1)}-01T00:00:00+08:00`)
  return { start, end, label: `${y}年${m + 1}月` }
}

/** The whole HK month before the one containing `d`. */
export function hkPrevMonthRange(d: Date = new Date()): { start: Date; end: Date; label: string } {
  const { start } = hkMonthRange(d)
  // One day before this month's start lands inside the previous month.
  return hkMonthRange(new Date(start.getTime() - 24 * 60 * 60 * 1000))
}

/**
 * HK school year containing `d`, running 1 Sep – 31 Aug.
 * Returns e.g. { start, end, label: "2025-26" }.
 */
export function hkSchoolYear(d: Date = new Date()): { start: Date; end: Date; label: string } {
  const p = toHkParts(d)
  const y = p.getUTCFullYear()
  const startYear = p.getUTCMonth() >= 8 ? y : y - 1 // Sep = month 8
  const start = new Date(`${startYear}-09-01T00:00:00+08:00`)
  const end   = new Date(`${startYear + 1}-09-01T00:00:00+08:00`)
  return { start, end, label: `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}` }
}

/** Human date+time in Hong Kong, for prompts and headings. */
export function hkNowLabel(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("zh-HK", {
    timeZone: HK_TZ, dateStyle: "full", timeStyle: "short",
  }).format(d)
}
