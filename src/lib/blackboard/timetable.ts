import { prisma } from "@/lib/prisma";
import { getLatestTerm } from "@/lib/agent-timetable";
import { codeMatchesClass } from "./projection";
import { timetableInputSchema, scheduleInputSchema } from "./validation";
import type { BoardSnapshot } from "./types";
export { getLessonState } from "./projection";
export async function getBoardTimetable(
  classId: string,
): Promise<BoardSnapshot["timetable"]> {
  const [cls, manual, schedule] = await Promise.all([
    prisma.class.findUniqueOrThrow({
      where: { id: classId },
      select: { name: true },
    }),
    prisma.blackboardTimetable.findUnique({ where: { classId } }),
    prisma.blackboardSchedule.findUnique({ where: { key: "school" } }),
  ]);
  const slots = schedule
    ? scheduleInputSchema.parse({
        slots: schedule.slots,
        expectedVersion: schedule.version,
      }).slots
    : [];
  if (manual?.source === "MANUAL") {
    const data = timetableInputSchema.parse({
      source: manual.source,
      rows: manual.rows,
      expectedVersion: manual.version,
    });
    return {
      source: "MANUAL",
      rows: data.rows,
      slots,
      version: manual.version,
      warning: slots.length ? null : "請管理員設定課節時間",
    };
  }
  const term = await getLatestTerm();
  if (!term)
    return {
      source: "AUTO",
      rows: [],
      slots,
      version: manual?.version || 0,
      warning: "尚未匯入時間表，可由班主任設定手動課表",
    };
  const all = await prisma.agentTimetable.findMany({
    where: { term },
    select: {
      id: true,
      classCode: true,
      dayOfWeek: true,
      period: true,
      periodLabel: true,
      subject: true,
    },
  });
  const seen = new Set<string>();
  const rows = all
    .filter((r) => codeMatchesClass(r.classCode, cls.name) && r.subject)
    .filter((r) => {
      const key = JSON.stringify([
        r.dayOfWeek,
        r.period,
        r.periodLabel,
        r.subject,
      ]);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r) => ({
      id: r.id,
      day: r.dayOfWeek,
      period: r.period,
      ...(r.periodLabel ? { label: r.periodLabel } : {}),
      subject: r.subject!,
    }));
  return {
    source: "AUTO",
    rows,
    slots,
    version: manual?.version || 0,
    warning: !rows.length
      ? "未找到明確班別課表，請使用手動課表"
      : !slots.length
        ? "請管理員設定課節時間"
        : null,
  };
}
