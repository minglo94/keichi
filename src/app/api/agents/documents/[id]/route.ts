import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin, isTeacherOrAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"

// GET — fetch one agent document with its full content.
// Scoped: the owner, or any admin, may read it.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const doc = await prisma.agentDocument.findUnique({
    where:   { id: params.id },
    include: {
      user: { select: { id: true, name: true, email: true } },
      task: { select: { agentId: true, status: true } },
    },
  })

  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Owners see their own; admins see all. A non-owning teacher cannot.
  if (doc.userId !== session.user.id && !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  return NextResponse.json(doc)
}
