import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { getLatestTerm, listTerms, setActiveTerm } from "@/lib/agent-timetable"
import { z } from "zod"

// Which timetable terms exist, and which one the whole app answers from.
export async function GET() {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const [terms, active] = await Promise.all([listTerms(), getLatestTerm()])
  return NextResponse.json({ terms, active })
}

const schema = z.object({ term: z.string().min(1).max(20) })

// PUT — pin the term used by 教師進修 and Ask Keida.
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const { term } = schema.parse(await req.json())

  const has = await prisma.agentTimetable.findFirst({ where: { term }, select: { id: true } })
  if (!has) return NextResponse.json({ error: "此學期沒有時間表資料" }, { status: 404 })

  await setActiveTerm(term)
  return NextResponse.json({ ok: true, active: term })
}

// DELETE ?term= — drop a term's rows entirely.
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const term = new URL(req.url).searchParams.get("term")?.trim()
  if (!term) return NextResponse.json({ error: "缺少學期" }, { status: 400 })

  const { count } = await prisma.agentTimetable.deleteMany({ where: { term } })
  return NextResponse.json({ ok: true, deleted: count, active: await getLatestTerm() })
}
