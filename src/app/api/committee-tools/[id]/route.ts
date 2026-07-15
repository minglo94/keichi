import { isTeacherOrAdmin, isAdmin, canEditCommittee } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const patchSchema = z.object({
  label:       z.string().min(1).max(100).optional(),
  description: z.string().max(300).optional(),
  type:        z.enum(["LINK", "EMBED", "HTML", "GOOGLE_SHEET"]).optional(),
  content:     z.string().min(1).optional(),
  order:       z.number().int().optional(),
  active:      z.boolean().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const tool = await prisma.committeeTool.findUnique({
    where: { id: params.id },
    include: { createdBy: { select: { id: true, name: true } } },
  })
  if (!tool) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(tool)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const tool = await prisma.committeeTool.findUnique({ where: { id: params.id } })
  if (!tool) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (!(await canEditCommittee(session.user.id, session.user.role, tool.committee))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const data = patchSchema.parse(await req.json())

  // SECURITY: only ADMIN may create, become, or edit an HTML tool's markup.
  if ((tool.type === "HTML" || data.type === "HTML") && !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "HTML 工具僅限管理員編輯" }, { status: 403 })
  }

  const updated = await prisma.committeeTool.update({
    where: { id: params.id },
    data,
    include: { createdBy: { select: { id: true, name: true } } },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const tool = await prisma.committeeTool.findUnique({ where: { id: params.id } })
  if (!tool) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (!(await canEditCommittee(session.user.id, session.user.role, tool.committee))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.committeeTool.delete({ where: { id: params.id } })
  return NextResponse.json({ deleted: true })
}
