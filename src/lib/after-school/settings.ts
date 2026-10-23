import { prisma } from "@/lib/prisma";
import { sourceConfigured } from "./source";
import { pushConfigured } from "./delivery";
import { AfterSchoolError } from "./http";
import type { z } from "zod";
import type { configSchema } from "./validation";
export function readiness() {
  return {
    source: sourceConfigured(),
    push: pushConfigured(),
    scheduler:
      !!process.env.AFTERSCHOOL_CRON_SECRET &&
      process.env.AFTERSCHOOL_CRON_SECRET.length >= 32,
  };
}
export async function saveConfig(
  input: z.infer<typeof configSchema>,
  actorId: string,
) {
  const ready = readiness();
  if (input.enabled && (!ready.source || !ready.push || !ready.scheduler))
    throw new AfterSchoolError(
      400,
      "請先配置Google只讀憑證、VAPID推送及排程密鑰",
    );
  const { expectedVersion, authorizeAutoApproval, ...data } = input;
  if (!authorizeAutoApproval && data.enabled)
    throw new AfterSchoolError(400, "須先授權每日自動批核");
  return prisma.$transaction(async (tx) => {
    if (expectedVersion === 0) {
      const created = await tx.afterSchoolConfig.create({
        data: { ...data, approverId: actorId },
      });
      return { version: created.version };
    }
    const updated = await tx.afterSchoolConfig.updateMany({
      where: { key: "school", version: expectedVersion },
      data: { ...data, approverId: actorId, version: { increment: 1 } },
    });
    if (!updated.count)
      throw new AfterSchoolError(409, "設定已改變，請重新載入");
    return { version: expectedVersion + 1 };
  });
}
