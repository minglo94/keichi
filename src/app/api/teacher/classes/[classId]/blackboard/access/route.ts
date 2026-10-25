import {
  boardApi,
  requireSameOrigin,
  readBody,
  BoardError,
} from "@/lib/blackboard/request";
import { prisma } from "@/lib/prisma";
import { requireBoardTeacher } from "@/lib/blackboard/access";
import bcrypt from "bcryptjs";
import { accessInputSchema } from "@/lib/blackboard/validation";
type Ctx = { params: Promise<{ classId: string }> };
export async function PUT(req: Request, props: Ctx) {
  const params = await props.params;
  return boardApi(async () => {
    requireSameOrigin(req);
    await requireBoardTeacher(params.classId, "manage");
    const v = await readBody(req, accessInputSchema);
    const passwordHash = v.password
      ? await bcrypt.hash(v.password, 12)
      : undefined;
    await prisma.$transaction(async (tx) => {
      const existing = await tx.blackboardAccess.findUnique({
        where: { classId: params.classId },
      });
      if (!existing) {
        if (v.expectedVersion !== 0)
          throw new BoardError(409, "設定已更新，請重新載入");
        if (!passwordHash) throw new BoardError(400, "首次設定必須輸入密碼");
        await tx.blackboardAccess.create({
          data: { classId: params.classId, passwordHash, enabled: v.enabled },
        });
      } else {
        const updated = await tx.blackboardAccess.updateMany({
          where: { classId: params.classId, version: v.expectedVersion },
          data: {
            enabled: v.enabled,
            ...(passwordHash ? { passwordHash } : {}),
            version: { increment: 1 },
            sessionVersion: { increment: 1 },
          },
        });
        if (!updated.count) throw new BoardError(409, "設定已更新，請重新載入");
        await tx.blackboardSession.deleteMany({
          where: { accessId: existing.id },
        });
      }
    });
    return { ok: true };
  });
}
