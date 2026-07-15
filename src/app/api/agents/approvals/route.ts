import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin, isTeacherOrAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const status     = req.nextUrl.searchParams.get("status") ?? "PENDING"
  const isApprover = isAdmin(session.user.role)

  const docs = await prisma.agentDocument.findMany({
    where: {
      approvalStatus: status as "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED",
      ...(!isApprover ? { userId: session.user.id } : {}),
    },
    include: { user: { select: { name: true, email: true } }, task: { select: { agentId: true } } },
    orderBy: { createdAt: "desc" },
    take:    50,
  })

  return NextResponse.json(docs)
}
