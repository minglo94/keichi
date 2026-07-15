import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

// GET — list conversations for current user (most recent first)
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 30)

  const conversations = await prisma.agentConversation.findMany({
    where:   { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    take:    Math.min(limit, 100),
    select: {
      id:        true,
      title:     true,
      createdAt: true,
      updatedAt: true,
      _count:    { select: { messages: true } },
    },
  })

  return NextResponse.json(conversations)
}

// POST — create a new conversation session
const createSchema = z.object({ title: z.string().max(200).optional() })

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { title } = createSchema.parse(await req.json())

  const conversation = await prisma.agentConversation.create({
    data: { userId: session.user.id, title: title ?? "新對話" },
  })

  return NextResponse.json(conversation, { status: 201 })
}
