import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { presetClassPlan } from "./preset-policy";
import { BoardError } from "./request";
type SourceRow = {
  id: string;
  name: string;
  blackboardAccess: { version: number } | null;
};
function planFor(rows: SourceRow[]) {
  let plan: ReturnType<typeof presetClassPlan>;
  try {
    plan = presetClassPlan(rows);
  } catch {
    throw new BoardError(409, "班別名稱重複，請先修正名冊");
  }
  if (plan.classes.length > 200)
    throw new BoardError(400, "班級超過200班，請分批由管理員處理");
  const expectedHash = createHash("sha256")
    .update(
      JSON.stringify(
        rows
          .map((r) => [r.id, r.name, r.blackboardAccess?.version || 0])
          .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      ),
    )
    .digest("hex");
  return { ...plan, expectedHash };
}
const select = {
  id: true,
  name: true,
  blackboardAccess: { select: { version: true } },
} as const;
export async function previewPresetPasswords() {
  const plan = planFor(await prisma.class.findMany({ select }));
  return {
    expectedHash: plan.expectedHash,
    classes: plan.classes.map((c) => c.name),
    skipped: plan.skipped,
  };
}
export async function applyPresetPasswords(
  expectedHash: string,
  actorId: string,
) {
  const snapshot = planFor(await prisma.class.findMany({ select }));
  if (snapshot.expectedHash !== expectedHash)
    throw new BoardError(409, "班級或登入設定已改變，請重新預覽");
  if (!snapshot.classes.length)
    throw new BoardError(400, "沒有可設定的標準班別");
  const hashes = new Map<string, string>();
  for (let i = 0; i < snapshot.classes.length; i += 4) {
    await Promise.all(
      snapshot.classes
        .slice(i, i + 4)
        .map(async (c) => hashes.set(c.id, await bcrypt.hash(c.password, 12))),
    );
  }
  await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(62917431)::text`;
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        select: { role: true },
      });
      if (actor?.role !== "ADMIN")
        throw new BoardError(403, "只有管理員可批量設定");
      await tx.$queryRaw`SELECT id FROM "Class" WHERE id IN (${Prisma.join(snapshot.classes.map((c) => c.id))}) ORDER BY id FOR UPDATE`;
      const rows = await tx.class.findMany({ select });
      const fresh = planFor(rows);
      if (fresh.expectedHash !== expectedHash)
        throw new BoardError(409, "班級或登入設定已改變，請重新預覽");
      const versions = new Map(
        rows.map((r) => [r.id, r.blackboardAccess?.version]),
      );
      for (const c of snapshot.classes) {
        const version = versions.get(c.id);
        if (version === undefined) {
          await tx.blackboardAccess.create({
            data: {
              classId: c.id,
              passwordHash: hashes.get(c.id)!,
              enabled: true,
            },
          });
        } else {
          const changed = await tx.blackboardAccess.updateMany({
            where: { classId: c.id, version },
            data: {
              passwordHash: hashes.get(c.id)!,
              enabled: true,
              version: { increment: 1 },
              sessionVersion: { increment: 1 },
            },
          });
          if (!changed.count)
            throw new BoardError(409, "登入設定已改變，請重新預覽");
        }
      }
      await tx.blackboardSession.deleteMany({
        where: {
          access: { classId: { in: snapshot.classes.map((c) => c.id) } },
        },
      });
    },
    { timeout: 60000 },
  );
  return { updated: snapshot.classes.length, skipped: snapshot.skipped };
}
