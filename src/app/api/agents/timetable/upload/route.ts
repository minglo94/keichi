import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { parseTimetableCsv, setActiveTerm } from "@/lib/agent-timetable"
import { z } from "zod"

const schema = z.object({ term: z.string().min(1).max(20), csv: z.string().min(1) })

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "僅管理員可上載時間表" }, { status: 403 })
  }

  const { term, csv } = schema.parse(await req.json())
  const { rows, errors } = parseTimetableCsv(csv)

  if (rows.length === 0) {
    return NextResponse.json({ error: "CSV 沒有有效資料", errors }, { status: 400 })
  }

  // Clear existing rows for this term, then bulk insert
  await prisma.agentTimetable.deleteMany({ where: { term } })

  await prisma.agentTimetable.createMany({
    data: rows.map((r) => ({ ...r, term })),
    skipDuplicates: true,
  })

  // The timetable you just uploaded is the one you mean to use. Without this
  // the active term was inferred from a string sort, so a term named in a new
  // style ("2026-2027" vs "2526") never took effect.
  await setActiveTerm(term)

  return NextResponse.json({ ok: true, imported: rows.length, term, errors })
}
