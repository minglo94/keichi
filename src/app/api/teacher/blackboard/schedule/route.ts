import {
  boardApi,
  requireSameOrigin,
  readBody,
  BoardError,
} from "@/lib/blackboard/request";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scheduleInputSchema } from "@/lib/blackboard/validation";
export async function PUT(req: Request) {
  return boardApi(async () => {
    requireSameOrigin(req);
    const s = await auth();
    if (s?.user?.role !== "ADMIN")
      throw new BoardError(403, "只有管理員可設定課節");
    const v = await readBody(req, scheduleInputSchema);
    await prisma.$transaction(async (tx) => {
      if (v.expectedVersion === 0) {
        if (
          await tx.blackboardSchedule.findUnique({ where: { key: "school" } })
        )
          throw new BoardError(409, "課節已更新");
        await tx.blackboardSchedule.create({
          data: { key: "school", slots: v.slots },
        });
      } else {
        const r = await tx.blackboardSchedule.updateMany({
          where: { key: "school", version: v.expectedVersion },
          data: { slots: v.slots, version: { increment: 1 } },
        });
        if (!r.count) throw new BoardError(409, "課節已更新，請重新載入");
      }
    });
    return { ok: true };
  });
}
