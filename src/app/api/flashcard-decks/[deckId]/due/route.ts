import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type RouteParams = { params: { deckId: string } }

// GET — cards due for review today (SM-2)
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const cards = await prisma.flashcard.findMany({
    where: { deckId: params.deckId },
    include: {
      reviews: {
        where: { userId: session.user.id },
      },
    },
  })

  const now = new Date()
  const dueCards = cards.filter((card) => {
    const review = card.reviews[0]
    if (!review) return true
    return review.nextReviewAt <= now
  })

  return NextResponse.json(dueCards)
}
