import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user?.id || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const tasks = await prisma.agentTask.findMany({
    where:   { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take:    20,
    include: { document: { select: { id: true, docType: true, approvalStatus: true } } },
  })

  return NextResponse.json(tasks)
}
