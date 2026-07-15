import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const patchSchema = z.object({
  title:       z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  startTime:   z.string().datetime().optional(),
  endTime:     z.string().datetime().nullable().optional(),
  location:    z.string().max(200).optional(),
  committee:   z.enum(["ADMIN", "DISCIPLINE", "IT", "CURRICULUM", "ECA"]).nullable().optional(),
  activityType: z.enum(["ECA", "ACADEMIC"]).nullable().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const activity = await prisma.activity.findUnique({
    where: { id: params.id },
    include: {
      createdBy:   { select: { id: true, name: true } },
      assignments: {
        include: { student: { select: { id: true, name: true, email: true, image: true } } },
        orderBy:  { createdAt: "asc" },
      },
    },
  })
  if (!activity) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Students only see their own assignment
  if (session.user.role === "STUDENT") {
    const mine = activity.assignments.filter((a) => a.studentId === session.user.id)
    return NextResponse.json({ ...activity, assignments: mine })
  }

  return NextResponse.json(activity)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const activity = await prisma.activity.findUnique({ where: { id: params.id } })
  if (!activity) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (activity.createdById !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const data = patchSchema.parse(await req.json())
  const updated = await prisma.activity.update({
    where: { id: params.id },
    data: {
      ...data,
      startTime: data.startTime ? new Date(data.startTime) : undefined,
      endTime:   data.endTime !== undefined
        ? (data.endTime === null ? null : new Date(data.endTime))
        : undefined,
    },
    include: { _count: { select: { assignments: true } } },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const activity = await prisma.activity.findUnique({ where: { id: params.id } })
  if (!activity) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (activity.createdById !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  await prisma.activity.delete({ where: { id: params.id } })
  return NextResponse.json({ deleted: true })
}
