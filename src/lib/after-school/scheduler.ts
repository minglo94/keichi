import { prisma } from "@/lib/prisma";
import { currentPhase, scheduleFor, instant } from "./model";
import { prepareDay, type Reader } from "./service";
import { deliverDay } from "./delivery";
import { approverAllowed } from "./repository";
export async function tick(
  options: { now?: Date; reader?: Reader; delivery?: typeof deliverDay } = {},
) {
  const now = options.now || new Date(),
    { date, time } = currentPhase(now);
  const config = await prisma.afterSchoolConfig.findUnique({
    where: { key: "school" },
  });
  if (!config?.enabled) return { status: "DISABLED" };
  if (!(await approverAllowed(config.approverId, true)))
    return { status: "APPROVER_REVOKED" };
  const schedule = scheduleFor(date);
  if (!schedule) return { status: "WEEKEND" };
  if (time < "06:00") return { status: "NOT_DUE" };
  let run = await prisma.afterSchoolRun.findUnique({ where: { date } });
  if (
    (!run?.automaticPreparedAt ||
      run.automaticPreparedAt < instant(date, "06:00")) &&
    now < instant(date, schedule.start)
  ) {
    await prepareDay(date, config.approverId, {
      automatic: true,
      now,
      reader: options.reader,
    });
    run = await prisma.afterSchoolRun.findUnique({ where: { date } });
  }
  if (!run || run.status !== "READY")
    return { status: run?.status || "NO_RUN" };
  return (options.delivery || deliverDay)(date, {
    clock: () => options.now || new Date(),
  });
}
