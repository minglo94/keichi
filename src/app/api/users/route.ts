import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET — list TEACHER users with optional ?q= name search
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role) && session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const q = new URL(req.url).searchParams.get("q")?.trim()

  const users = await prisma.user.findMany({
    where: {
      role: "TEACHER",
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    select: {
      id:    true,
      name:  true,
      email: true,
      image: true,
      committeeRoles: { select: { committee: true, isChair: true } },
    },
    orderBy: { name: "asc" },
    take: 20,
  })

  return NextResponse.json(users)
}
