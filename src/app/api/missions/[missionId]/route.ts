import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

type RouteParams = { params: { missionId: string } }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const mission = await prisma.mission.findUnique({
    where: { id: params.missionId },
    include: {
      submissions:
        session.user.role === "STUDENT"
          ? { where: { studentId: session.user.id }, select: { status: true, aiScore: true, aiFeedback: true } }
          : false,
    },
  })

  if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 })

  return NextResponse.json(mission)
}

const updateSchema = z.object({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  pointsReward: z.number().int().min(10).max(500).optional(),
  order: z.number().int().optional(),
})

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const data = updateSchema.parse(await req.json())

  const mission = await prisma.mission.findUnique({
    where: { id: params.missionId },
    include: { class: true },
  })
  if (!mission || mission.class.teacherId !== session.user.id) {
    return NextResponse.json({ error: "Mission not found" }, { status: 404 })
  }

  const updated = await prisma.mission.update({
    where: { id: params.missionId },
    data,
  })

  return NextResponse.json(updated)
}
