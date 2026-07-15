import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

type RouteParams = { params: { classId: string } }

const homeroomSelect = {
  id: true, name: true, image: true, email: true,
} as const

const patchSchema = z.object({
  homeroomTeacherId: z.string().nullable(),
})

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const cls = await prisma.class.findUnique({
    where: { id: params.classId },
    include: {
      teacher: { select: { id: true, name: true, image: true } },
      homeroomTeacher: { select: homeroomSelect },
      _count: { select: { enrollments: true, missions: true } },
    },
  })

  if (!cls) return NextResponse.json({ error: "Class not found" }, { status: 404 })

  return NextResponse.json(cls)
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const cls = await prisma.class.findUnique({ where: { id: params.classId } })
  if (!cls) return NextResponse.json({ error: "Not found" }, { status: 404 })
  // 僅班級擁有者或管理員可指派班主任
  if (cls.teacherId !== session.user.id && session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { homeroomTeacherId } = patchSchema.parse(await req.json())

  // 若指派某人，驗證對方是教職員（TEACHER / ADMIN）
  if (homeroomTeacherId) {
    const target = await prisma.user.findUnique({
      where: { id: homeroomTeacherId },
      select: { role: true },
    })
    if (!target || !isTeacherOrAdmin(target.role)) {
      return NextResponse.json({ error: "Homeroom teacher must be a staff member" }, { status: 422 })
    }
  }

  const updated = await prisma.class.update({
    where: { id: params.classId },
    data: { homeroomTeacherId },
    include: { homeroomTeacher: { select: homeroomSelect } },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const cls = await prisma.class.findUnique({ where: { id: params.classId } })
  if (!cls) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (cls.teacherId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  await prisma.class.delete({ where: { id: params.classId } })

  return new NextResponse(null, { status: 204 })
}
