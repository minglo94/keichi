import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { broadcastNewMission } from "@/lib/pusher"
import { z } from "zod"

const missionSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  type: z.enum(["VIDEO", "FORM", "AI_QUIZ", "PROMPT"]),
  content: z.record(z.unknown()),
  difficulty: z.enum(["BASIC", "ADVANCED", "CHALLENGE"]).default("BASIC"),
  prereqId: z.string().optional(),
  pointsReward: z.number().int().min(10).max(500).default(100),
  order: z.number().int().default(0),
})

type RouteParams = { params: { classId: string } }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const missions = await prisma.mission.findMany({
    where: {
      classId: params.classId,
      ...(session.user.role === "STUDENT" ? { status: "PUBLISHED" } : {}),
    },
    orderBy: { order: "asc" },
    include: {
      submissions:
        session.user.role === "STUDENT"
          ? { where: { studentId: session.user.id }, select: { status: true } }
          : { select: { id: true, status: true, aiScore: true, student: { select: { name: true } } } },
    },
  })

  return NextResponse.json(missions)
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const cls = await prisma.class.findFirst({
    where: { id: params.classId, teacherId: session.user.id },
  })
  if (!cls) return NextResponse.json({ error: "Class not found" }, { status: 404 })

  const data = missionSchema.parse(await req.json())
  const { content, ...rest } = data
  const mission = await prisma.mission.create({
    data: { ...rest, content: content as object, classId: params.classId },
  })

  if (mission.status === "PUBLISHED") {
    await broadcastNewMission(params.classId, {
      missionId: mission.id,
      title: mission.title,
      type: mission.type,
      pointsReward: mission.pointsReward,
    })
  }

  return NextResponse.json(mission, { status: 201 })
}
