import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isTeacherOrAdmin } from "@/lib/roles"
import { z } from "zod"

// GET — list my favorited tool keys
export async function GET() {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const favorites = await prisma.toolFavorite.findMany({
    where:   { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select:  { toolKey: true },
  })

  return NextResponse.json({ keys: favorites.map((f) => f.toolKey) })
}

const bodySchema = z.object({ toolKey: z.string().min(1).max(300) })

// POST — add a favorite (idempotent)
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { toolKey } = bodySchema.parse(await req.json())

  await prisma.toolFavorite.upsert({
    where:  { userId_toolKey: { userId: session.user.id, toolKey } },
    create: { userId: session.user.id, toolKey },
    update: {},
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}

// DELETE — remove a favorite
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { toolKey } = bodySchema.parse(await req.json())

  await prisma.toolFavorite.deleteMany({
    where: { userId: session.user.id, toolKey },
  })

  return NextResponse.json({ ok: true })
}
