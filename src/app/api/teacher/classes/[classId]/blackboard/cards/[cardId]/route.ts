import {
  boardApi,
  requireSameOrigin,
  readBody,
  BoardError,
} from "@/lib/blackboard/request";
import { z } from "zod";
import { cardWriteSchema } from "@/lib/blackboard/validation";
import { updateBoardCard, archiveBoardCard } from "@/lib/blackboard/cards";
type Ctx = { params: { classId: string; cardId: string } };
export async function PUT(req: Request, { params }: Ctx) {
  return boardApi(async () => {
    requireSameOrigin(req);
    const v = await readBody(req, cardWriteSchema);
    if (v.expectedVersion === undefined) throw new BoardError(400, "缺少版本");
    return updateBoardCard(
      params.classId,
      params.cardId,
      v.card,
      v.targetClassIds,
      v.expectedVersion,
    );
  });
}
export async function DELETE(req: Request, { params }: Ctx) {
  return boardApi(async () => {
    requireSameOrigin(req);
    const v = await readBody(
      req,
      z.object({ expectedVersion: z.number().int().min(1) }).strict(),
    );
    return archiveBoardCard(params.classId, params.cardId, v.expectedVersion);
  });
}
