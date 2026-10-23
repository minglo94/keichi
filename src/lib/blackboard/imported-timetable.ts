import { codeMatchesClass } from "./projection";
import type { TimetableRow } from "./types";
type ImportedLesson = {
  id: string;
  classCode: string | null;
  subject: string | null;
  dayOfWeek: number;
  period: number;
  periodLabel: string | null;
};
function yearGroups(code: string | null, className: string) {
  const year = className
    .trim()
    .toUpperCase()
    .match(/^(?:F\.?|S)?([1-6])[A-Z]$/)?.[1];
  if (!year || !code) return [];
  const groups: { groupCode: string; groupLabel: string }[] = [];
  for (const part of code.split(/[\/,、+&]/)) {
    const match = part
      .normalize("NFKC")
      .trim()
      .toUpperCase()
      .match(/^S([1-6])\s*-\s*([XG])\s*([1-9]\d?)$/);
    if (!match || match[1] !== year) continue;
    const [, grade, kind, number] = match;
    const ordinal =
      (
        { 1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六" } as Record<
          string,
          string
        >
      )[number] || number;
    groups.push({
      groupCode: `S${grade}-${kind}${number}`,
      groupLabel:
        kind === "X"
          ? `選修${ordinal}`
          : grade === "3" && number === "1"
            ? "中文／英文／數學分組"
            : "分組課",
    });
  }
  return groups;
}
/** Grade group rows are reference options, never proof of student membership. */
export function projectImportedTimetable(
  all: ImportedLesson[],
  className: string,
) {
  const seen = new Set<string>(),
    rows: TimetableRow[] = [];
  for (const lesson of all) {
    const direct = codeMatchesClass(lesson.classCode, className);
    const groups = direct ? [null] : yearGroups(lesson.classCode, className);
    if (
      !groups.length ||
      !lesson.subject?.trim() ||
      lesson.dayOfWeek < 1 ||
      lesson.dayOfWeek > 5
    )
      continue;
    for (const group of groups) {
      const key = JSON.stringify([
        lesson.dayOfWeek,
        lesson.period,
        lesson.periodLabel,
        lesson.subject.trim(),
        group?.groupCode || null,
      ]);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        id: group ? lesson.id + ":" + group.groupCode : lesson.id,
        day: lesson.dayOfWeek,
        period: lesson.period,
        ...(lesson.periodLabel ? { label: lesson.periodLabel } : {}),
        subject: lesson.subject.trim(),
        ...(group || {}),
      });
    }
  }
  return { rows, hasYearGroups: rows.some((r) => !!r.groupCode) };
}
