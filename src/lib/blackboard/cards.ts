import { prisma } from "@/lib/prisma";
import { requireBoardTeacher, teacherSubjects } from "./access";
import { canEditCard } from "./policy";
import { BoardError } from "./request";
import type { BoardCardInput } from "./types";
async function authorizeTargets(
  classId: string,
  targets: string[],
  input: BoardCardInput,
) {
  const actor = await requireBoardTeacher(classId, "publish");
  if (
    !targets.length ||
    !targets.includes(classId) ||
    new Set(targets).size !== targets.length
  )
    throw new BoardError(400, "請選擇有效的目標班別");
  if (targets.length > 1 && !actor.isAdmin)
    throw new BoardError(403, "只有管理員可向多班發布");
  const count = await prisma.class.count({ where: { id: { in: targets } } });
  if (count !== targets.length) throw new BoardError(400, "班別不存在");
  if (!actor.isManager) {
    const subjects = await teacherSubjects(actor.userId, actor.cls.name);
    if (!input.subject || !subjects.includes(input.subject))
      throw new BoardError(403, "請選擇自己任教的科目；未設定請交由班主任發布");
  }
  return actor;
}
function data(input: BoardCardInput) {
  return {
    ...input,
    link: input.link || null,
    startsAt: input.startsAt ? new Date(input.startsAt) : null,
    endsAt: input.endsAt ? new Date(input.endsAt) : null,
  };
}
export async function createBoardCard(
  classId: string,
  input: BoardCardInput,
  targets: string[],
) {
  const actor = await authorizeTargets(classId, targets, input);
  const c = await prisma.blackboardCard.create({
    data: {
      ...data(input),
      authorId: actor.userId,
      targets: { create: targets.map((classId) => ({ classId })) },
    },
  });
  return { id: c.id, version: c.version };
}
export async function updateBoardCard(
  classId: string,
  cardId: string,
  input: BoardCardInput,
  targets: string[],
  expectedVersion: number,
) {
  const actor = await authorizeTargets(classId, targets, input);
  await prisma.$transaction(async (tx) => {
    const c = await tx.blackboardCard.findFirst({
      where: { id: cardId, targets: { some: { classId } } },
      include: { targets: true },
    });
    if (!c) throw new BoardError(404, "找不到便條");
    if (
      !canEditCard(actor.isManager, actor.userId, c.authorId) ||
      (!actor.isAdmin && c.targets.some((t) => t.classId !== classId))
    )
      throw new BoardError(403, "沒有修改此便條的權限");
    const r = await tx.blackboardCard.updateMany({
      where: { id: cardId, version: expectedVersion },
      data: { ...data(input), version: { increment: 1 } },
    });
    if (!r.count) throw new BoardError(409, "便條已由其他老師更新，請重新載入");
    await tx.blackboardCardTarget.deleteMany({ where: { cardId } });
    await tx.blackboardCardTarget.createMany({
      data: targets.map((classId) => ({ cardId, classId })),
    });
  });
  return { ok: true };
}
export async function archiveBoardCard(
  classId: string,
  cardId: string,
  expectedVersion: number,
) {
  const actor = await requireBoardTeacher(classId, "publish");
  await prisma.$transaction(async (tx) => {
    const c = await tx.blackboardCard.findFirst({
      where: { id: cardId, targets: { some: { classId } } },
      include: { targets: true },
    });
    if (!c) throw new BoardError(404, "找不到便條");
    if (
      !canEditCard(actor.isManager, actor.userId, c.authorId) ||
      (!actor.isAdmin && c.targets.length > 1)
    )
      throw new BoardError(403, "沒有封存權限");
    const r = await tx.blackboardCard.updateMany({
      where: { id: cardId, version: expectedVersion },
      data: { archivedAt: new Date(), version: { increment: 1 } },
    });
    if (!r.count) throw new BoardError(409, "便條已更新，請重新載入");
  });
  return { ok: true };
}
