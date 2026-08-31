import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { pdSession } from "@/lib/pd-auth"
import { commonFreeSlots } from "@/lib/free-slots"
import { z } from "zod"

// POST — 共同空堂 for an explicit list of teachers, or for everyone matching a
// 科組／委員會 filter. 科組 falls back to the subject each teacher actually
// teaches on the timetable, since 教師資料 is new and mostly unfilled.
const schema = z.object({
  teacherIds: z.array(z.string()).max(40).optional(),
  department: z.string().optional(),
  committee:  z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await pdSession()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const d = schema.parse(await req.json())
  const dept = d.department?.trim()
  const cmte = d.committee?.trim()
  const ids  = d.teacherIds ?? []

  const staff = await prisma.user.findMany({
    where:  {
      role: { in: ["TEACHER", "ADMIN"] },
      ...(ids.length > 0 ? { id: { in: ids } } : {}),
    },
    select: { id: true, name: true, nameEn: true, email: true, departments: true, committees: true, timetableName: true },
    take:   500,
  })

  let picked = staff
  if (ids.length === 0) {
    if (!dept && !cmte) {
      // Every teacher at once is never a useful answer — it just returns an
      // empty grid. Ask for a filter instead of pretending to compute it.
      return NextResponse.json({ error: "請先選擇科組、委員會或教師" }, { status: 400 })
    }
    // Subject fallback: what they teach on the timetable counts as a 科組.
    let taught = new Map<string, string[]>()
    if (dept) {
      const rows = await prisma.agentTimetable.findMany({
        where:    { subject: { not: null } },
        select:   { teacherName: true, subject: true },
        distinct: ["teacherName", "subject"],
      })
      taught = rows.reduce((m, r) => {
        if (r.subject) m.set(r.teacherName, [...(m.get(r.teacherName) ?? []), r.subject])
        return m
      }, new Map<string, string[]>())
    }
    picked = staff.filter((t) => {
      if (cmte && !t.committees.includes(cmte)) return false
      if (dept) {
        const byName = [t.timetableName, t.name, t.nameEn]
          .filter(Boolean)
          .flatMap((n) => taught.get(n as string) ?? [])
        if (!t.departments.includes(dept) && !byName.includes(dept)) return false
      }
      return true
    })
  }

  const result = await commonFreeSlots(picked)
  return NextResponse.json({
    ...result,
    teachers: picked.map((t) => ({ id: t.id, name: t.name, email: t.email })),
  })
}
