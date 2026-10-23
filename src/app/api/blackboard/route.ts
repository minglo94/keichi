import {
  boardApi,
  requireSameOrigin,
  readBody,
  BoardError,
} from "@/lib/blackboard/request";
import { requireBoardSession } from "@/lib/blackboard/session";
import { getBoardSnapshot } from "@/lib/blackboard/snapshot";
export const dynamic = "force-dynamic";
export async function GET() {
  return boardApi(async () => {
    const s = await requireBoardSession();
    return getBoardSnapshot(s.classId);
  });
}
