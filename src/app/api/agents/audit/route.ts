import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"

// GET — audit log (admin only). Optional filters: ?action= ?agentId= ?limit=
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const params  = new URL(req.url).searchParams
  const action  = params.get("action") || undefined
  const agentId = params.get("agentId") || undefined
  const limit   = Math.min(Number(params.get("limit") ?? 100), 300)

  const logs = await prisma.agentAuditLog.findMany({
    where:   { ...(action ? { action } : {}), ...(agentId ? { agentId } : {}) },
    orderBy: { createdAt: "desc" },
    take:    limit,
    include: { user: { select: { name: true, email: true } } },
  })

  return NextResponse.json(logs)
}
