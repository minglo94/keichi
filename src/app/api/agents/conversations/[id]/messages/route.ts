import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { updateConversationMemory } from "@/lib/agent-memory"
import { z } from "zod"

const appendSchema = z.object({
  role:    z.enum(["user", "assistant"]),
  content: z.string().min(1),
  agentId: z.string().optional(),
})

// POST — append a message and touch updatedAt on the conversation
export async function POST(
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

  const data = appendSchema.parse(await req.json())

  const [message] = await prisma.$transaction([
    prisma.agentMessage.create({
      data: { conversationId: params.id, ...data },
    }),
    prisma.agentConversation.update({
      where: { id: params.id },
      data:  { updatedAt: new Date() },
    }),
  ])

  // Fire-and-forget: refresh the conversation's rolling memory summary once
  // it has a full exchange (assistant reply = a turn just completed). Never
  // await — this must not add latency to message persistence.
  if (data.role === "assistant") {
    updateConversationMemory(params.id, session.user.id).catch((err) =>
      console.error("[conversations/messages] memory update failed:", err)
    )
  }

  return NextResponse.json(message, { status: 201 })
}
