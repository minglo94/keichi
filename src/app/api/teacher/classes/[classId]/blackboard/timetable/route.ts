import {
  boardApi,
  requireSameOrigin,
  readBody,
  BoardError,
} from "@/lib/blackboard/request";
import { prisma } from "@/lib/prisma";
import { requireBoardTeacher } from "@/lib/blackboard/access";
import { timetableInputSchema } from "@/lib/blackboard/validation";
type Ctx = { params: { classId: string } };
export async function PUT(req: Request, { params }: Ctx) {
  return boardApi(async () => {
    requireSameOrigin(req);
    await requireBoardTeacher(params.classId, "manage");
    const v = await readBody(req, timetableInputSchema);
    await prisma.$transaction(async (tx) => {
      if (v.expectedVersion === 0) {
        if (
          await tx.blackboardTimetable.findUnique({
            where: { classId: params.classId },
          })
        )
          throw new BoardError(409, "課表已更新");
        await tx.blackboardTimetable.create({
          data: { classId: params.classId, source: v.source, rows: v.rows },
        });
      } else {
        const r = await tx.blackboardTimetable.updateMany({
          where: { classId: params.classId, version: v.expectedVersion },
          data: { source: v.source, rows: v.rows, version: { increment: 1 } },
        });
        if (!r.count) throw new BoardError(409, "課表已更新，請重新載入");
      }
    });
    return { ok: true };
  });
}
