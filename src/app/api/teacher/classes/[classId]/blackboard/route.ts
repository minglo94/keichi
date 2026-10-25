import {
  boardApi,
  requireSameOrigin,
  readBody,
  BoardError,
} from "@/lib/blackboard/request";
import { requireBoardTeacher, teacherSubjects } from "@/lib/blackboard/access";
import { prisma } from "@/lib/prisma";
import { getBoardSnapshot, publicCard } from "@/lib/blackboard/snapshot";
import type { TeacherBoard } from "@/lib/blackboard/types";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ classId: string }> };
export async function GET(_req: Request, props: Ctx) {
  const params = await props.params;
  return boardApi(async () => {
    const a = await requireBoardTeacher(params.classId, "publish");
    const [snapshot, cards, access, schedule, classes, subjects] =
      await Promise.all([
        getBoardSnapshot(params.classId),
        prisma.blackboardCard.findMany({
          where: { targets: { some: { classId: params.classId } } },
          include: { targets: true },
          orderBy: { createdAt: "desc" },
          take: 500,
        }),
        prisma.blackboardAccess.findUnique({
          where: { classId: params.classId },
          select: { enabled: true, version: true },
        }),
        prisma.blackboardSchedule.findUnique({
          where: { key: "school" },
          select: { version: true },
        }),
        a.isAdmin
          ? prisma.class.findMany({
              select: { id: true, name: true },
              orderBy: { name: "asc" },
            })
          : Promise.resolve([{ id: params.classId, name: a.cls.name }]),
        teacherSubjects(a.userId, a.cls.name),
      ]);
    return {
      snapshot,
      cards: cards.map((c) => ({
        ...publicCard(c),
        authorId: c.authorId,
        archivedAt: c.archivedAt?.toISOString() || null,
        targetClassIds: c.targets.map((t) => t.classId),
      })),
      userId: a.userId,
      isManager: a.isManager,
      isAdmin: a.isAdmin,
      subjects,
      access: access || { enabled: false, version: 0 },
      scheduleVersion: schedule?.version || 0,
      classes,
    } satisfies TeacherBoard;
  });
}
