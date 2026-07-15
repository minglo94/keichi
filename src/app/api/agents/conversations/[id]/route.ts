import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

// GET — fetch one conversation with all messages
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const convo = await prisma.agentConversation.findUnique({
    where:   { id: params.id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  })

  if (!convo || convo.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json(convo)
}

// PATCH — update title
const patchSchema = z.object({ title: z.string().min(1).max(200) })

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const convo = await prisma.agentConversation.findUnique({ where: { id: params.id } })
  if (!convo || convo.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { title } = patchSchema.parse(await req.json())
  const updated = await prisma.agentConversation.update({
    where: { id: params.id },
    data:  { title },
  })

  return NextResponse.json(updated)
}

// DELETE — delete conversation + all messages (cascade)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const convo = await prisma.agentConversation.findUnique({ where: { id: params.id } })
  if (!convo || convo.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await prisma.agentConversation.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
