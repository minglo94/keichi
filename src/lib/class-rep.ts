import { prisma } from "@/lib/prisma"

// 課代表／科代表. Authorisation is always server-side against the ClassRep
// table — never a client flag.

/**
 * null = not a rep of this class; [""] = 全科; ["中文"] = that subject only.
 * A rep who has since left the class is not a rep: the ClassRep row can
 * outlive the enrollment, so both are checked.
 */
export async function repSubjects(classId: string, userId: string): Promise<string[] | null> {
  const [rows, enrolled] = await Promise.all([
    prisma.classRep.findMany({ where: { classId, studentId: userId }, select: { subject: true } }),
    prisma.classEnrollment.findFirst({ where: { classId, studentId: userId }, select: { id: true } }),
  ])
  return rows.length && enrolled ? rows.map((r) => r.subject) : null
}

/** Pure form of the subject rule, for callers that already have the rep's subjects. */
export function subjectsAllow(subjects: string[] | null, subject: string | null): boolean {
  if (!subjects) return false
  if (subjects.includes("")) return true
  return !!subject && subjects.includes(subject.trim())
}

/**
 * May this student record homework (or 收功課) for this class and subject? A
 * 全科 rep may do anything; a 中文科代表 only 中文 — checked here so it can't
 * be bypassed by posting straight to the API.
 */
export async function canRecordHomework(classId: string, userId: string, subject: string | null): Promise<boolean> {
  return subjectsAllow(await repSubjects(classId, userId), subject)
}
