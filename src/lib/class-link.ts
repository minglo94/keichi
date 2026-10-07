import { prisma } from "@/lib/prisma"
import { classKey } from "@/lib/roster-parse"

// AgentTimetable.classCode is free text ("F.3A", "S4A", "3A-ENG") with no FK to
// Class, whose name is also free text ("3A"). Both sides go through classKey()
// so the many ways a school writes a class name meet in the middle.

/**
 * The keys a timetable class code may match on: the full key, then the bare
 * form-and-letter prefix, so a subject-suffixed code ("3A-ENG" → "3AENG") still
 * finds the 3A class.
 */
export function lessonClassKeys(classCode: string | null | undefined): string[] {
  const full = classKey(classCode ?? "")
  if (!full) return []
  const prefix = full.match(/^(\d[A-Z])/)?.[1]
  return prefix && prefix !== full ? [full, prefix] : [full]
}

export type ClassMatch =
  | { kind: "one";  classId: string; name: string; scope: "mine" | "school" }
  | { kind: "many"; candidates: { classId: string; name: string }[]; scope: "mine" | "school" }
  | { kind: "none"; key: string; suggestedName: string }

type Row = { id: string; name: string }

/** Pure: match one timetable class code against a list of classes. */
export function matchClassCode(
  classCode: string | null | undefined,
  classes: Row[],
): { kind: "one"; hit: Row } | { kind: "many"; hits: Row[] } | { kind: "none"; key: string } {
  const keys = lessonClassKeys(classCode)
  if (keys.length === 0) return { kind: "none", key: "" }
  const byKey = new Map<string, Row[]>()
  for (const c of classes) {
    const k = classKey(c.name)
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), c])
  }
  for (const k of keys) {
    const hits = byKey.get(k)
    if (hits?.length === 1) return { kind: "one", hit: hits[0] }
    if (hits && hits.length > 1) return { kind: "many", hits }
  }
  return { kind: "none", key: keys[keys.length - 1] }
}

/**
 * Resolve the class a timetable lesson refers to. The teacher's own classes
 * are tried first, so one teacher's "3A" row can't hijack another's lesson;
 * only if that finds nothing does it widen to the whole school.
 *
 * Nothing is ever created here — an accidental duplicate 3A is worse than one
 * extra tap on 建立班別.
 */
export async function resolveLessonClass(teacherId: string, classCode: string | null): Promise<ClassMatch> {
  const all = await prisma.class.findMany({ select: { id: true, name: true, teacherId: true, homeroomTeacherId: true } })
  const mine = all.filter((c) => c.teacherId === teacherId || c.homeroomTeacherId === teacherId)

  for (const [scope, pool] of [["mine", mine], ["school", all]] as const) {
    const m = matchClassCode(classCode, pool)
    if (m.kind === "one")  return { kind: "one", classId: m.hit.id, name: m.hit.name, scope }
    if (m.kind === "many") return { kind: "many", candidates: m.hits.map((h) => ({ classId: h.id, name: h.name })), scope }
  }
  // Suggest the shortest key — "3A-ENG" suggests creating "3A", not "3AENG".
  const keys = lessonClassKeys(classCode)
  const key  = keys[keys.length - 1] ?? ""
  return { kind: "none", key, suggestedName: key }
}
