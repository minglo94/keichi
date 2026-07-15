import { isTeacherOrAdmin, isAdmin, canEditCommittee } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const createSchema = z.object({
  committee:   z.enum(["ADMIN", "DISCIPLINE", "IT", "CURRICULUM", "ECA"]),
  label:       z.string().min(1).max(100),
  description: z.string().max(300).optional(),
  type:        z.enum(["LINK", "EMBED", "HTML", "GOOGLE_SHEET"]),
  content:     z.string().min(1),
  order:       z.number().int().default(0),
  active:      z.boolean().default(true),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const params    = new URL(req.url).searchParams
  const committee = params.get("committee")
  const ids       = params.get("ids")
  const staff     = isTeacherOrAdmin(session.user.role)

  // Resolve specific IDs (used by the staff favorites grid). Tool content can
  // include raw HTML/embed URLs, so this by-id lookup is staff-only — students
  // must not be able to enumerate arbitrary tool content.
  if (ids) {
    if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    const idList = ids.split(",").filter(Boolean).slice(0, 100)
    const tools = await prisma.committeeTool.findMany({
      where: { id: { in: idList } },
      select: { id: true, label: true, description: true, type: true, content: true, committee: true },
    })
    return NextResponse.json(tools)
  }

  const tools = await prisma.committeeTool.findMany({
    where: {
      ...(committee ? { committee: committee as "ADMIN" | "DISCIPLINE" | "IT" | "CURRICULUM" | "ECA" } : {}),
      ...(!staff ? { active: true } : {}),
    },
    orderBy: { order: "asc" },
    include: { createdBy: { select: { id: true, name: true } } },
  })

  return NextResponse.json(tools)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const data = createSchema.parse(await req.json())

  if (!(await canEditCommittee(session.user.id, session.user.role, data.committee))) {
    return NextResponse.json({ error: "管理員或組長專屬功能" }, { status: 403 })
  }

  // SECURITY: HTML tools render arbitrary markup in a sandboxed iframe.
  // Restrict authoring them to ADMIN — chairs keep LINK/EMBED/GOOGLE_SHEET.
  if (data.type === "HTML" && !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "HTML 工具僅限管理員建立" }, { status: 403 })
  }

  const tool = await prisma.committeeTool.create({
    data: { ...data, createdById: session.user.id },
    include: { createdBy: { select: { id: true, name: true } } },
  })

  return NextResponse.json(tool, { status: 201 })
}
