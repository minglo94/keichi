import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import {
  boardApi,
  BoardError,
  readBody,
  requireSameOrigin,
} from "@/lib/blackboard/request";
import {
  previewPresetPasswords,
  applyPresetPasswords,
} from "@/lib/blackboard/preset-passwords";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
async function admin() {
  const session = await auth();
  if (!session?.user) throw new BoardError(403, "只有管理員可批量設定");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true },
  });
  if (user?.role !== "ADMIN") throw new BoardError(403, "只有管理員可批量設定");
  return user.id;
}
export async function GET() {
  return boardApi(async () => {
    await admin();
    return previewPresetPasswords();
  });
}
export async function POST(req: Request) {
  return boardApi(async () => {
    requireSameOrigin(req);
    const actor = await admin();
    const input = await readBody(
      req,
      z
        .object({
          expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
          confirmation: z.literal("PRESET_ALL_BLACKBOARDS"),
        })
        .strict(),
    );
    return applyPresetPasswords(input.expectedHash, actor);
  });
}
