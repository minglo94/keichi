import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AfterSchoolError } from "./http";
import { createHash, timingSafeEqual } from "node:crypto";
export async function actor(adminOnly = false) {
  const s = await auth();
  if (!s?.user || !["TEACHER", "ADMIN"].includes(s.user.role))
    throw new AfterSchoolError(403, "只有授權教師可操作");
  const user = await prisma.user.findUnique({
    where: { id: s.user.id },
    select: { id: true, role: true },
  });
  if (!user || !["TEACHER", "ADMIN"].includes(user.role))
    throw new AfterSchoolError(403, "帳戶無效");
  if (
    user.role !== "ADMIN" &&
    (adminOnly ||
      !(await prisma.committeeRole.findFirst({
        where: { userId: user.id, committee: "ADMIN", isChair: true },
      })))
  )
    throw new AfterSchoolError(403, "只有管理員或行政委員會主席可操作");
  return { id: user.id, isAdmin: user.role === "ADMIN" };
}
export function cronAuthorized(req: Request) {
  const expected = process.env.AFTERSCHOOL_CRON_SECRET;
  if (!expected || expected.length < 32)
    throw new AfterSchoolError(503, "未設定課後班排程密鑰");
  const actual = (req.headers.get("authorization") || "").replace(
    /^Bearer /,
    "",
  );
  const hash = (s: string) => createHash("sha256").update(s).digest();
  if (!timingSafeEqual(hash(actual), hash(expected)))
    throw new AfterSchoolError(401, "Unauthorized");
}
