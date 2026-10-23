import { createHash } from "node:crypto";
export const SESSION_MS = 8 * 60 * 60 * 1000;
export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function canonicalClassName(v: string) {
  return v.trim().toUpperCase();
}
export function sessionIsValid(
  s: { expiresAt: Date; sessionVersion: number },
  a: { enabled: boolean; sessionVersion: number },
  now = new Date(),
) {
  return (
    a.enabled && s.sessionVersion === a.sessionVersion && s.expiresAt > now
  );
}
export function canManageBoard(via: string) {
  return ["admin", "owner", "homeroom"].includes(via);
}
export function canEditCard(manager: boolean, actor: string, author: string) {
  return manager || actor === author;
}

export function uniqueClassId(
  classes: { id: string; name: string }[],
  input: string,
): string | null {
  const matches = classes.filter(
    (c) => canonicalClassName(c.name) === canonicalClassName(input),
  );
  return matches.length === 1 ? matches[0].id : null;
}
