import { prisma } from "@/lib/prisma"
import type { ActivityType } from "@prisma/client"

// School rule: 課外活動 on Mon/Tue, 學科活動 on Wed/Thu/Fri.
// JS getDay()/getUTCDay(): 0=Sun, 1=Mon … 6=Sat.
export const ALLOWED_WEEKDAYS: Record<ActivityType, number[]> = {
  ECA:      [1, 2],       // 星期一、二
  ACADEMIC: [3, 4, 5],    // 星期三、四、五
}

export const WEEKDAY_LABEL = ["日", "一", "二", "三", "四", "五", "六"]

export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  ECA:      "課外活動",
  ACADEMIC: "學科活動",
}

const DAY_MS  = 86_400_000
const HK_OFF  = 8 * 3_600_000        // Hong Kong = UTC+8, no DST
const HOUR_MS = 3_600_000

export type DateSuggestion = {
  startTime: string      // ISO
  endTime:   string | null
  weekday:   number      // 0-6 (HK)
}

export type SuggestResult = {
  activityType: ActivityType
  weekdays:     number[]      // allowed weekdays for this type
  suggestions:  DateSuggestion[]
}

/**
 * Suggest future dates to hold an activity so that:
 *   1) the weekday matches the school rule for its type (課外 → Mon/Tue,
 *      學科 → Wed–Fri), and
 *   2) none of the assigned students clash with another activity at that time.
 *
 * Keeps the original time-of-day and duration; only the date changes. Since
 * Hong Kong has no DST, adding whole days preserves the local wall-clock, so
 * candidate weekdays are tracked by simple increment (no TZ library needed).
 */
export async function suggestActivityDates(opts: {
  activityType:     ActivityType
  startTime:        Date
  endTime:          Date | null
  studentIds:       string[]
  excludeActivityId: string
  maxSuggestions?:  number
  scanDays?:        number
}): Promise<SuggestResult> {
  const {
    activityType, startTime, endTime, studentIds, excludeActivityId,
    maxSuggestions = 6, scanDays = 84,
  } = opts

  const allowed    = ALLOWED_WEEKDAYS[activityType]
  const durationMs = (endTime ?? new Date(startTime.getTime() + HOUR_MS)).getTime() - startTime.getTime()
  const nowMs      = Date.now()

  // HK weekday of the original start; candidate i has weekday (base + i) % 7.
  const baseWeekday = new Date(startTime.getTime() + HK_OFF).getUTCDay()

  // Begin just after "now" even if the original date is in the past.
  const daysSinceStart = Math.floor((nowMs - startTime.getTime()) / DAY_MS)
  const startI  = daysSinceStart > 0 ? daysSinceStart + 1 : 1
  const endI    = startI + scanDays

  // Pre-fetch the other activities these students are busy with in the window.
  const windowEnd = new Date(startTime.getTime() + endI * DAY_MS + durationMs)
  const busy = studentIds.length === 0 ? [] : await prisma.activityAssignment.findMany({
    where: {
      studentId:  { in: studentIds },
      activityId: { not: excludeActivityId },
      activity:   { startTime: { gte: new Date(nowMs - DAY_MS), lte: windowEnd } },
    },
    include: { activity: { select: { startTime: true, endTime: true } } },
  })
  const busyRanges = busy.map((b) => {
    const s = b.activity.startTime.getTime()
    const e = (b.activity.endTime ?? new Date(s + HOUR_MS)).getTime()
    return { s, e }
  })

  const suggestions: DateSuggestion[] = []
  for (let i = startI; i <= endI && suggestions.length < maxSuggestions; i++) {
    const weekday = (baseWeekday + i) % 7
    if (!allowed.includes(weekday)) continue

    const candStartMs = startTime.getTime() + i * DAY_MS
    if (candStartMs <= nowMs) continue
    const candEndMs = candStartMs + durationMs

    const clash = busyRanges.some((b) => b.s < candEndMs && b.e > candStartMs)
    if (clash) continue

    suggestions.push({
      startTime: new Date(candStartMs).toISOString(),
      endTime:   endTime ? new Date(candEndMs).toISOString() : null,
      weekday,
    })
  }

  return { activityType, weekdays: allowed, suggestions }
}
