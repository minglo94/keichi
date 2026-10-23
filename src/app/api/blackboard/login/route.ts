import {
  boardApi,
  requireSameOrigin,
  readBody,
  BoardError,
} from "@/lib/blackboard/request";
import { loginSchema } from "@/lib/blackboard/validation";
import { loginBoard } from "@/lib/blackboard/session";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  return boardApi(async () => {
    requireSameOrigin(req);
    const v = await readBody(req, loginSchema);
    return loginBoard(v.className, v.password, req);
  });
}
