import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { BoardError } from "./request";
import {
  SESSION_MS,
  hashToken,
  sessionIsValid,
  canonicalClassName,
  uniqueClassId,
} from "./policy";
export const BOARD_COOKIE =
  process.env.NODE_ENV === "production" ? "__Host-kcss-board" : "kcss-board";
const cookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};
const dummyHash = bcrypt.hashSync("blackboard-dummy-never-a-password", 12);
// Fail-closed, atomic fixed windows. No client-supplied IP header is trusted by default.
async function throttle(key: string, limit: number) {
  const window = Math.floor(Date.now() / 900000);
  const row = await prisma.rateLimit.upsert({
    where: { key: `board:${window}:${key}` },
    create: {
      key: `board:${window}:${key}`,
      count: 1,
      windowStart: new Date(),
    },
    update: { count: { increment: 1 } },
  });
  if (row.count > limit)
    throw new BoardError(429, "登入嘗試太頻繁，請稍後再試");
}
export async function loginBoard(
  className: string,
  password: string,
  req: Request,
) {
  const name = canonicalClassName(className);
  const ipHeader = process.env.BLACKBOARD_TRUSTED_IP_HEADER;
  const source = ipHeader
    ? req.headers.get(ipHeader)?.trim().slice(0, 128) || "unknown"
    : "shared";
  await throttle(`source:${hashToken(source)}`, source === "shared" ? 300 : 30);
  await throttle(`class:${hashToken(name)}`, 10);
  // Apply exactly the same Unicode whitespace/case normalization to stored names.
  const classId = uniqueClassId(
    await prisma.class.findMany({ select: { id: true, name: true } }),
    name,
  );
  const a = classId
    ? await prisma.blackboardAccess.findUnique({ where: { classId } })
    : null;
  const valid = await bcrypt.compare(password, a?.passwordHash || dummyHash);
  if (!a || !a.enabled || !valid) throw new BoardError(401, "班別或密碼不正確");
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_MS);
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.blackboardAccess.findUnique({ where: { id: a.id } });
    if (!fresh || !fresh.enabled || fresh.sessionVersion !== a.sessionVersion)
      throw new BoardError(401, "班別或密碼不正確");
    await tx.blackboardSession.create({
      data: {
        tokenHash: hashToken(token),
        accessId: a.id,
        sessionVersion: a.sessionVersion,
        expiresAt,
      },
    });
  });
  (await cookies()).set(BOARD_COOKIE, token, {
    ...cookieOptions,
    expires: expiresAt,
  });
  return { ok: true };
}
export async function requireBoardSession() {
  const token = (await cookies()).get(BOARD_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token))
    throw new BoardError(401, "請重新登入班級黑板");
  const s = await prisma.blackboardSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { access: true },
  });
  if (!s || !sessionIsValid(s, s.access))
    throw new BoardError(401, "請重新登入班級黑板");
  return { classId: s.access.classId };
}
export async function logoutBoard() {
  const jar = await cookies();
  const token = jar.get(BOARD_COOKIE)?.value;
  if (token)
    await prisma.blackboardSession.deleteMany({
      where: { tokenHash: hashToken(token) },
    });
  jar.set(BOARD_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return { ok: true };
}
