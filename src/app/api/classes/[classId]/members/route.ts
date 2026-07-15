import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type RouteParams = { params: { classId: string } }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const enrollments = await prisma.classEnrollment.findMany({
    where: { classId: params.classId },
    include: {
      student: { select: { id: true, name: true, image: true, email: true } },
    },
    orderBy: { student: { name: "asc" } },
  })

  return NextResponse.json(enrollments)
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { userId } = await req.json()

  const enrollment = await prisma.classEnrollment.create({
    data: { classId: params.classId, studentId: userId },
    include: { student: { select: { id: true, name: true, image: true, email: true } } },
  })

  return NextResponse.json(enrollment, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const url = new URL(req.url)
  // Support both /members/[id] and /members?userId=...
  // In our case, the frontend uses /members/[userId] but this route is members/route.ts
  // So let's check for userId in query or use a dynamic segment if needed.
  // The frontend code I wrote: `/api/classes/${selectedGroup.id}/members/${userId}`
  // Wait, I should probably use query param to be consistent with StudentGroup.
  
  const userId = url.searchParams.get("userId")
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  await prisma.classEnrollment.deleteMany({
    where: { classId: params.classId, studentId: userId },
  })

  return new NextResponse(null, { status: 204 })
}
