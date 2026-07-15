import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { calculateNextReview, getInitialSM2State } from "@/lib/sm2"
import { z } from "zod"

const reviewSchema = z.object({
  cardId: z.string(),
  grade: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  classId: z.string(),
})

type RouteParams = { params: { deckId: string } }

export async function POST(req: NextRequest, { params: _params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { cardId, grade } = reviewSchema.parse(await req.json())

  const existing = await prisma.flashcardReview.findUnique({
    where: { cardId_userId: { cardId, userId: session.user.id } },
  })

  const currentState = existing ?? getInitialSM2State()
  const nextState = calculateNextReview(currentState, grade)

  const review = await prisma.flashcardReview.upsert({
    where: { cardId_userId: { cardId, userId: session.user.id } },
    create: {
      cardId,
      userId: session.user.id,
      ...nextState,
      lastReviewAt: new Date(),
    },
    update: {
      ...nextState,
      lastReviewAt: new Date(),
    },
  })

  return NextResponse.json(review)
}
