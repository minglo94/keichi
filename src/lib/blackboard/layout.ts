import { prisma } from "@/lib/prisma";
import { BoardError } from "./request";
import type { BoardLayoutInput } from "./types";
export async function saveBoardLayout(
  classId: string,
  input: BoardLayoutInput,
) {
  await prisma.$transaction(async (tx) => {
    const cards = await tx.blackboardCardTarget.findMany({
      where: { classId },
      select: { cardId: true },
    });
    const allowed = new Set([
      "homework",
      "missing",
      "timetable",
      ...cards.map((c) => c.cardId),
    ]);
    if (input.items.some((i) => !allowed.has(i.id)))
      throw new BoardError(400, "版面包含其他班別或不存在的便條");
    if (input.expectedVersion === 0) {
      if (await tx.blackboardLayout.findUnique({ where: { classId } }))
        throw new BoardError(409, "版面已更新");
      await tx.blackboardLayout.create({
        data: { classId, items: input.items },
      });
    } else {
      const r = await tx.blackboardLayout.updateMany({
        where: { classId, version: input.expectedVersion },
        data: { items: input.items, version: { increment: 1 } },
      });
      if (!r.count)
        throw new BoardError(409, "版面已更新，草稿已保留，請重新載入後再試");
    }
  });
  return { ok: true };
}
