import {
  boardApi,
  requireSameOrigin,
  readBody,
  BoardError,
} from "@/lib/blackboard/request";
import { logoutBoard } from "@/lib/blackboard/session";
export async function POST(req: Request) {
  return boardApi(async () => {
    requireSameOrigin(req);
    return logoutBoard();
  });
}
