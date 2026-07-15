import { isAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

type RouteParams = { params: { groupId: string } }

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  type: z.enum(["FORM_CLASS", "SUBJECT_CLASS", "SPECIFIC"]).optional(),
  description: z.string().optional(),
  teacherId: z.string().nullable().optional(),
})

const teacherSelect = { id: true, name: true, image: true, email: true } as const

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const group = await prisma.studentGroup.findUnique({
    where: { id: params.groupId },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
        orderBy: { user: { name: "asc" } },
      },
      teacher: { select: teacherSelect },
    },
  })

  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(group)
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const data = updateSchema.parse(await req.json())
  const group = await prisma.studentGroup.update({
    where: { id: params.groupId },
    data,
    include: { teacher: { select: teacherSelect } },
  })

  return NextResponse.json(group)
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.studentGroup.delete({ where: { id: params.groupId } })
  return new NextResponse(null, { status: 204 })
}
