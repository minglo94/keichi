import {
  boardApi,
  requireSameOrigin,
  readBody,
  BoardError,
} from "@/lib/blackboard/request";
import { cardWriteSchema } from "@/lib/blackboard/validation";
import { createBoardCard } from "@/lib/blackboard/cards";
type Ctx = { params: { classId: string } };
export async function POST(req: Request, { params }: Ctx) {
  return boardApi(async () => {
    requireSameOrigin(req);
    const v = await readBody(req, cardWriteSchema);
    return createBoardCard(params.classId, v.card, v.targetClassIds);
  });
}
