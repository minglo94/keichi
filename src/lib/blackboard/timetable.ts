import { prisma } from "@/lib/prisma";
import { getLatestTerm } from "@/lib/agent-timetable";
import { projectImportedTimetable } from "./imported-timetable";
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
  const { rows, hasYearGroups } = projectImportedTimetable(all, cls.name);
  return {
    source: "AUTO",
    rows,
    slots,
    version: manual?.version || 0,
    warning:
      [
        !rows.length ? "未找到明確班別課表，請使用手動課表" : null,
        !slots.length ? "請管理員設定課節時間" : null,
        hasYearGroups
          ? "年級分組課列出該節科目選項，請按實際選科／分組出席；並非全班須出席每個科目。"
          : null,
      ]
        .filter(Boolean)
        .join("；") || null,
  };
}
