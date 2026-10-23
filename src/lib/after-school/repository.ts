import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { AfterSchoolError } from "./http";
export async function withLease<T>(
  date: string,
  fn: (token: string) => Promise<T>,
): Promise<T> {
  const key = `after-school:${date}`,
    token = randomUUID(),
    now = new Date(),
    expiresAt = new Date(+now + 300000);
  const created = await prisma.afterSchoolLease.createMany({
    data: [{ key, token, expiresAt }],
    skipDuplicates: true,
  });
  if (!created.count) {
    const claimed = await prisma.afterSchoolLease.updateMany({
      where: { key, expiresAt: { lte: now } },
      data: { token, expiresAt },
    });
    if (!claimed.count)
      throw new AfterSchoolError(409, "此日期正在處理，請稍後查看結果");
  }
  try {
    return await fn(token);
  } finally {
    await prisma.afterSchoolLease.deleteMany({ where: { key, token } });
  }
}
export async function approverAllowed(userId: string, automatic = false) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (user?.role === "ADMIN") return true;
  if (automatic || user?.role !== "TEACHER") return false;
  return !!(await prisma.committeeRole.findFirst({
    where: { userId, committee: "ADMIN", isChair: true },
  }));
}
