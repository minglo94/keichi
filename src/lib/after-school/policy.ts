import {
  normalizeClass,
  normalizeNumber,
  type Participant,
  type ResolvedParticipant,
} from "./model";
export function resolveParticipants(
  rows: Participant[],
  roster: {
    studentId: string;
    role: string;
    className: string;
    classId: string;
    number: string | null;
  }[],
) {
  const out: ResolvedParticipant[] = [];
  const errors: string[] = [];
  for (const row of rows) {
    const hits = roster.filter(
      (r) =>
        r.role === "STUDENT" &&
        normalizeClass(r.className) === row.className &&
        normalizeNumber(r.number) === row.number,
    );
    const ids = new Set(hits.map((r) => r.studentId));
    const classes = new Set(hits.map((r) => r.classId));
    if (ids.size !== 1 || classes.size !== 1) {
      errors.push(
        `${row.className} #${row.number} ${hits.length ? "名冊配對不唯一" : "未有學生帳戶"}`,
      );
      continue;
    }
    if (out.some((r) => r.studentId === hits[0].studentId)) {
      errors.push(
        `${row.className} #${row.number} 同一學生配對至多個來源身分，請先修正名冊`,
      );
      continue;
    }
    out.push({ ...row, studentId: hits[0].studentId });
  }
  return { rows: out, errors };
}
export function canAttemptPush(status: string) {
  return status === "PENDING";
}
export function deliveryOutcome(
  error: unknown,
): "UNKNOWN" | "FAILED" | "EXPIRED" {
  const code = (error as { statusCode?: number })?.statusCode;
  if (code === 404 || code === 410) return "EXPIRED";
  return code && code >= 400 && code < 500 ? "FAILED" : "UNKNOWN";
}
