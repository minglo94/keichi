import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

// Resolve pasted roster rows (班級 / 學號 / 姓名) to real student accounts,
// so an activity can be linked to students — and therefore their emails —
// rather than storing loose text.
//
// Matching order, most reliable first:
//   1. class name + class number  (ClassEnrollment — the school's own numbering)
//   2. exact student name — Chinese (name) or English (nameEn)
//   3. email, if the name column actually holds one
// Rows that match nothing come back flagged so the teacher can fix them
// BEFORE saving, instead of being silently dropped.

const schema = z.object({
  rows: z.array(z.object({
    id:        z.number(),
    className: z.string().optional().default(""),
    studentId: z.string().optional().default(""),
    name:      z.string().optional().default(""),
  })).max(500),
})

const norm = (s: string) => s.trim().toLowerCase()
// "01", "1", " 1 " should all match each other.
const normNum = (s: string) => s.trim().replace(/^0+/, "").toLowerCase()

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { rows } = schema.parse(await req.json())
  const usable = rows.filter((r) => r.name.trim() || (r.className.trim() && r.studentId.trim()))
  if (usable.length === 0) return NextResponse.json({ results: [] })

  // Pull the candidate pool once rather than querying per row.
  const classNames = Array.from(new Set(usable.map((r) => r.className.trim()).filter(Boolean)))
  const names      = Array.from(new Set(usable.map((r) => r.name.trim()).filter(Boolean)))

  const [enrollments, byName] = await Promise.all([
    classNames.length
      ? prisma.classEnrollment.findMany({
          where:   { class: { name: { in: classNames } } },
          select:  {
            classNumber: true,
            class:   { select: { name: true } },
            student: { select: { id: true, name: true, nameEn: true, email: true, role: true } },
          },
        })
      : Promise.resolve([]),
    names.length
      ? prisma.user.findMany({
          where:  {
            role: "STUDENT",
            OR: [{ name: { in: names } }, { nameEn: { in: names } }, { email: { in: names } }],
          },
          select: { id: true, name: true, nameEn: true, email: true },
        })
      : Promise.resolve([]),
  ])

  type Hit = { id: string; name: string | null; nameEn?: string | null; email: string | null }

  // (class, number) → student
  const byClassNo = new Map<string, Hit>()
  for (const e of enrollments) {
    if (e.student.role !== "STUDENT" || !e.classNumber) continue
    byClassNo.set(`${norm(e.class.name)}#${normNum(e.classNumber)}`, e.student)
  }

  const nameMap = new Map<string, Hit>()
  for (const u of byName) {
    if (u.name)   nameMap.set(norm(u.name), u)
    if (u.nameEn) nameMap.set(norm(u.nameEn), u)
    if (u.email)  nameMap.set(norm(u.email), u)
  }

  const results = rows.map((r) => {
    const cls  = r.className.trim()
    const num  = r.studentId.trim()
    const name = r.name.trim()

    const hit =
      (cls && num ? byClassNo.get(`${norm(cls)}#${normNum(num)}`) : undefined) ??
      (name ? nameMap.get(norm(name)) : undefined)

    if (!hit) {
      return { id: r.id, matched: false as const }
    }
    return {
      id:      r.id,
      matched: true as const,
      userId:  hit.id,
      name:    hit.name,
      email:   hit.email,
    }
  })

  return NextResponse.json({ results })
}
