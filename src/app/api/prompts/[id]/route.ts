import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin, isAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import type { Role } from "@prisma/client"

const SUBJECTS = ["LESSON", "MATERIAL", "ASSESSMENT", "FEEDBACK", "PARENT", "CLASSROOM", "ADMIN", "PD"] as const
const TYPES    = ["PLAN", "CREATE", "ASSESS", "COMMUNICATE"] as const

const patchSchema = z.object({
  subject:    z.enum(SUBJECTS).optional(),
  type:       z.enum(TYPES).optional(),
  title:      z.string().min(1).max(200).optional(),
  tags:       z.array(z.string().max(30)).max(20).optional(),
  promptText: z.string().min(1).max(4000).optional(),
})

// Seeded ("system") prompts have createdById=null, which never matches a
// real session.user.id — so only an ADMIN can edit/delete them.
function canManage(promptCreatedById: string | null, userId: string, role: Role | undefined) {
  return promptCreatedById === userId || isAdmin(role)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const prompt = await prisma.prompt.findUnique({ where: { id: params.id } })
  if (!prompt) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!canManage(prompt.createdById, session.user.id, session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const data = patchSchema.parse(await req.json())

  const updated = await prisma.prompt.update({
    where: { id: params.id },
    data,
    include: { createdBy: { select: { id: true, name: true } } },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const prompt = await prisma.prompt.findUnique({ where: { id: params.id } })
  if (!prompt) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!canManage(prompt.createdById, session.user.id, session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.prompt.delete({ where: { id: params.id } })

  return NextResponse.json({ deleted: true })
}
