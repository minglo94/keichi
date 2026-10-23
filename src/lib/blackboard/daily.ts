import { hkDayStart, hkYmd } from "../hk-date";
import type { SchoolSlot, TimetableRow } from "./types";
import { slotForLesson } from "./projection";
export function dateWindow(date: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    date < "2000-01-01" ||
    date > "2100-12-31"
  )
    throw new Error("日期格式無效");
  const start = hkDayStart(date);
  if (!Number.isFinite(start.getTime()) || hkYmd(start) !== date)
    throw new Error("日期格式無效");
  return { start, end: new Date(start.getTime() + 86400000) };
}
export function shiftDate(date: string, days: number) {
  return hkYmd(new Date(dateWindow(date).start.getTime() + days * 86400000));
}
export function lessonCells(
  rows: TimetableRow[],
  slots: SchoolSlot[],
  day: number,
) {
  if (day < 1 || day > 5) return [];
  return Array.from({ length: 10 }, (_, i) => {
    const period = i + 1;
    const all = rows.filter((r) => r.day === day && r.period === period);
    const seen = new Set<string>();
    const lessons = all.filter((r) => {
      const key = JSON.stringify([
        r.subject,
        r.groupCode || "",
        r.groupLabel || "",
      ]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return {
      period,
      lessons,
      ids: all.map((r) => r.id),
      slot:
        slots.find((s) => s.kind === "LESSON" && s.period === period) ||
        (all[0] ? slotForLesson(all[0], slots) : undefined),
    };
  });
}
