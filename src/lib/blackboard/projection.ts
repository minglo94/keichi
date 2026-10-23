import type { SchoolSlot, TimetableRow } from "./types";
import { hkYmd, hkHm, hkWeekday } from "../hk-date";
export function codeMatchesClass(code: string | null, name: string) {
  if (!code) return false;
  const canonical = (s: string) =>
    s
      .trim()
      .toUpperCase()
      .replace(/^(F\.?|S)(?=\d)/, "");
  const key = canonical(name);
  return code.split(/[\/,、+&]/).some((part) => {
    const v = canonical(part);
    return (
      v === key ||
      (v.startsWith(`${key}-`) && /^[A-Z]+$/.test(v.slice(key.length + 1)))
    );
  });
}
export function isPublished(
  c: { startsAt: Date | null; endsAt: Date | null; archivedAt: Date | null },
  now: Date,
) {
  return (
    !c.archivedAt &&
    (!c.startsAt || c.startsAt <= now) &&
    (!c.endsAt || c.endsAt > now)
  );
}
export function getLessonState(
  rows: TimetableRow[],
  slots: SchoolSlot[],
  now: Date,
) {
  const day = hkWeekday(hkYmd(now));
  const hm = hkHm(now);
  if (day === 0 || day === 6)
    return { currentIds: [], nextIds: [], status: "週末" };
  const today = rows.filter((r) => r.day === day);
  const slotFor = (r: TimetableRow) => slotForLesson(r, slots);
  const currentIds = today
    .filter((r) => {
      const s = slotFor(r);
      return s && s.startTime <= hm && hm < s.endTime;
    })
    .map((r) => r.id);
  const upcoming = today
    .map((r) => ({ r, s: slotFor(r) }))
    .filter((v) => v.s && v.s.startTime > hm)
    .sort((a, b) => a.s!.startTime.localeCompare(b.s!.startTime));
  const nextIds = upcoming
    .filter((v) => v.s!.startTime === upcoming[0]?.s?.startTime)
    .map((v) => v.r.id);
  const activeSlot = slots.find((s) => s.startTime <= hm && hm < s.endTime);
  return {
    currentIds,
    nextIds,
    status: currentIds.length
      ? "上課中"
      : activeSlot?.kind !== "LESSON" && activeSlot
        ? activeSlot.label
        : !slots.length
          ? "課節時間未設定"
          : !today.length
            ? "今日沒有課堂"
            : nextIds.length
              ? "未上課"
              : "已放學",
  };
}
type RecordRow = {
  resolved: boolean;
  kind: string;
  studentId: string;
  date: Date;
  subject: string | null;
  homework: { title: string } | null;
};
export function projectMissing(
  records: RecordRow[],
  enrollments: { studentId: string; classNumber: string | null }[],
) {
  const numbers = new Map(enrollments.map((e) => [e.studentId, e.classNumber]));
  return records
    .filter(
      (r) =>
        !r.resolved && ["MISSING_HOMEWORK", "HOMEWORK_ABSENT"].includes(r.kind),
    )
    .map((r) => ({
      homework: r.homework?.title || "未指明功課",
      subject: r.subject,
      number: numbers.get(r.studentId) || "未設定",
      date: hkYmd(r.date),
      absent: r.kind === "HOMEWORK_ABSENT",
    }));
}

export function subjectsForClass(
  rows: { classCode: string | null; subject: string | null }[],
  name: string,
): string[] {
  return Array.from(
    new Set(
      rows
        .filter((r) => codeMatchesClass(r.classCode, name))
        .map((r) => r.subject)
        .filter((s): s is string => !!s),
    ),
  );
}
export function slotForLesson(row: TimetableRow, slots: SchoolSlot[]) {
  return slots.find(
    (s) =>
      s.kind === "LESSON" &&
      (row.period > 0
        ? s.period === row.period
        : !s.period && s.label === row.label),
  );
}
