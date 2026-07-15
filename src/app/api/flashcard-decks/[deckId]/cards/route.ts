import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const cardSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
})

type RouteParams = { params: { deckId: string } }

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const cards = await prisma.flashcard.findMany({
    where: { deckId: params.deckId },
    orderBy: { createdAt: "asc" },
  })
  return NextResponse.json(cards)
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Verify deck ownership
  const deck = await prisma.flashcardDeck.findFirst({
    where: { id: params.deckId, ownerId: session.user.id },
  })
  if (!deck) return NextResponse.json({ error: "Deck not found" }, { status: 404 })

  const data = cardSchema.parse(await req.json())
  const card = await prisma.flashcard.create({
    data: { ...data, deckId: params.deckId },
  })
  return NextResponse.json(card, { status: 201 })
}
