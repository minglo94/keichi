import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { broadcastPointsAwarded } from "@/lib/pusher"
import { z } from "zod"

type RouteParams = { params: { classId: string } }

// GET — leaderboard + personal history
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const leaderboard = await prisma.pointTransaction.groupBy({
    by: ["userId"],
    where: { classId: params.classId },
    _sum: { amount: true },
    orderBy: { _sum: { amount: "desc" } },
    take: 50,
  })

  const userIds = leaderboard.map((r) => r.userId)
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, image: true },
  })
  const userMap = Object.fromEntries(users.map((u) => [u.id, u]))

  const ranked = leaderboard.map((r, i) => ({
    rank: i + 1,
    user: userMap[r.userId],
    totalPoints: r._sum.amount ?? 0,
  }))

  return NextResponse.json(ranked)
}

const awardSchema = z.object({
  userId: z.string().optional(),
  amount: z.number().int().min(1).max(200),
  reason: z.enum(["ATTENDANCE", "MISSION", "FLASHCARD", "TEACHER"]),
  note: z.string().optional(),
})

// POST — award points
export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const data = awardSchema.parse(await req.json())

  if (session.user.role === "STUDENT") {
    if (!["FLASHCARD", "ATTENDANCE"].includes(data.reason)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    data.userId = session.user.id
  }

  const targetUserId = data.userId ?? session.user.id

  const [tx] = await prisma.$transaction([
    prisma.pointTransaction.create({
      data: {
        userId: targetUserId,
        classId: params.classId,
        amount: data.amount,
        reason: data.reason,
        awardedBy: (session.user.role === "TEACHER" || session.user.role === "ADMIN") ? session.user.id : null,
        note: data.note,
      },
    }),
  ])

  const total = await prisma.pointTransaction.aggregate({
    where: { userId: targetUserId, classId: params.classId },
    _sum: { amount: true },
  })

  await broadcastPointsAwarded(params.classId, {
    userId: targetUserId,
    amount: data.amount,
    reason: data.reason,
    totalPoints: total._sum.amount ?? 0,
    note: data.note,
  })

  return NextResponse.json(tx, { status: 201 })
}
