import { isTeacherOrAdmin } from "@/lib/roles"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const classes = await prisma.class.findMany({
    select: { id: true, name: true, classCode: true },
    orderBy: { name: "asc" },
  })
  return NextResponse.json(classes)
}
