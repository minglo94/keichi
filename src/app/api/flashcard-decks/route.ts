import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const createSchema = z.object({
  title: z.string().min(1).max(100),
  classId: z.string().optional(),
  isPublic: z.boolean().default(false),
})

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const decks = await prisma.flashcardDeck.findMany({
    where: { ownerId: session.user.id },
    include: { _count: { select: { cards: true } } },
    orderBy: { updatedAt: "desc" },
  })
  return NextResponse.json(decks)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const data = createSchema.parse(await req.json())
  const deck = await prisma.flashcardDeck.create({
    data: { ...data, ownerId: session.user.id },
  })
  return NextResponse.json(deck, { status: 201 })
}
