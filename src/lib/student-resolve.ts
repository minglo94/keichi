import { prisma } from "@/lib/prisma"
import { classKey, nameKey, numKey } from "@/lib/roster-parse"

// Resolving pasted roster rows (班級 / 學號 / 姓名) to real student accounts.
//
// Shared by /api/students/resolve (the 新增活動 grid) and the activity
// 批量指派 textarea, which previously had their own half-matching copies:
// the textarea looked up the class name with an exact `equals`, so a roster
// written "S4A" never found a class stored "4A", and its name fallback
// compared the WHOLE pasted line against User.name so it never matched either.
//
// Everything is compared on a normalised key, on both sides, so the roster can
// be written the way the school actually writes it.

export { classKey, numKey, nameKey, splitRosterLine } from "@/lib/roster-parse"

export type RosterInput = {
  id:         number
  className?: string
  studentId?: string
  name?:      string
}

export type RosterMatch =
  | {
      id: number; matched: true
      userId: string; name: string | null; email: string | null
      /** How it was found, for the status column. */
      via: "class-no" | "class-name" | "name" | "email"
    }
  | { id: number; matched: false; reason: string }

type Hit = { id: string; name: string | null; nameEn: string | null; email: string | null }

export async function resolveRoster(rows: RosterInput[]): Promise<RosterMatch[]> {
  const usable = rows.filter((r) =>
    (r.name ?? "").trim() || ((r.className ?? "").trim() && (r.studentId ?? "").trim()))
  if (usable.length === 0) return []

  const wantedClassKeys = new Set(
    usable.map((r) => classKey(r.className ?? "")).filter(Boolean))

  // Classes and students are both small enough to key in memory, and doing so
  // is the only way to compare normalised forms — a SQL `in` can't.
  const [classes, students] = await Promise.all([
    prisma.class.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({
      where:  { role: "STUDENT" },
      select: { id: true, name: true, nameEn: true, email: true },
      take:   5000,
    }),
  ])

  const classIds = classes.filter((c) => wantedClassKeys.has(classKey(c.name))).map((c) => c.id)
  const enrollments = classIds.length
    ? await prisma.classEnrollment.findMany({
        where:  { classId: { in: classIds } },
        select: {
          classNumber: true,
          class:   { select: { name: true } },
          student: { select: { id: true, name: true, nameEn: true, email: true, role: true } },
        },
      })
    : []

  const byClassNo   = new Map<string, Hit>()          // "4A#15" → student
  const byClassName = new Map<string, Hit[]>()        // "4A#陳大文" → students
  for (const e of enrollments) {
    if (e.student.role !== "STUDENT") continue
    const ck = classKey(e.class.name)
    if (e.classNumber) byClassNo.set(`${ck}#${numKey(e.classNumber)}`, e.student)
    for (const n of [e.student.name, e.student.nameEn]) {
      if (!n) continue
      const k = `${ck}#${nameKey(n)}`
      byClassName.set(k, [...(byClassName.get(k) ?? []), e.student])
    }
  }

  const byName  = new Map<string, Hit[]>()
  const byEmail = new Map<string, Hit>()
  for (const u of students) {
    for (const n of [u.name, u.nameEn]) {
      if (!n) continue
      const k = nameKey(n)
      byName.set(k, [...(byName.get(k) ?? []), u])
    }
    if (u.email) byEmail.set(u.email.trim().toLowerCase(), u)
  }

  return rows.map((r): RosterMatch => {
    const cls  = (r.className ?? "").trim()
    const num  = (r.studentId ?? "").trim()
    const name = (r.name ?? "").trim()
    const ck   = classKey(cls)
    const nk   = nameKey(name)

    // 1. class + number — the school's own numbering, most reliable.
    if (ck && num) {
      const hit = byClassNo.get(`${ck}#${numKey(num)}`)
      if (hit) return { id: r.id, matched: true, userId: hit.id, name: hit.name, email: hit.email, via: "class-no" }
    }
    // 2. an email in the name column.
    if (nk.includes("@")) {
      const hit = byEmail.get(name.toLowerCase())
      if (hit) return { id: r.id, matched: true, userId: hit.id, name: hit.name, email: hit.email, via: "email" }
      return { id: r.id, matched: false, reason: "電郵未登記" }
    }
    // 3. name within the given class — disambiguates a name shared school-wide.
    if (ck && nk) {
      const inClass = byClassName.get(`${ck}#${nk}`)
      if (inClass?.length === 1) {
        const hit = inClass[0]
        return { id: r.id, matched: true, userId: hit.id, name: hit.name, email: hit.email, via: "class-name" }
      }
    }
    // 4. name alone.
    if (nk) {
      const hits = byName.get(nk)
      if (hits?.length === 1) {
        const hit = hits[0]
        return { id: r.id, matched: true, userId: hit.id, name: hit.name, email: hit.email, via: "name" }
      }
      if (hits && hits.length > 1) {
        return { id: r.id, matched: false, reason: `有 ${hits.length} 位同名，請填班別及學號` }
      }
    }

    // Say which part failed — "未配對" alone leaves nothing to act on.
    if (ck && !classes.some((c) => classKey(c.name) === ck)) {
      return { id: r.id, matched: false, reason: `找不到班別「${cls}」` }
    }
    if (ck && num) return { id: r.id, matched: false, reason: `${cls} 冇 ${num} 號` }
    if (nk)        return { id: r.id, matched: false, reason: "找不到此姓名" }
    return { id: r.id, matched: false, reason: "資料不足" }
  })
}
