import { isAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const schema = z.object({
  userId:    z.string(),
  committee: z.enum(["ADMIN", "DISCIPLINE", "IT", "CURRICULUM", "ECA"]),
  isChair:   z.boolean().default(false),
})

// POST — add user to committee
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const data = schema.parse(await req.json())

  const role = await prisma.committeeRole.upsert({
    where:  { userId_committee: { userId: data.userId, committee: data.committee } },
    update: { isChair: data.isChair },
    create: data,
  })

  return NextResponse.json(role, { status: 201 })
}

// DELETE — remove user from committee
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const userId    = searchParams.get("userId")
  const committee = searchParams.get("committee")

  if (!userId || !committee) {
    return NextResponse.json({ error: "userId and committee required" }, { status: 400 })
  }

  await prisma.committeeRole.deleteMany({
    where: {
      userId,
      committee: committee as "ADMIN" | "DISCIPLINE" | "IT" | "CURRICULUM" | "ECA",
    },
  })

  return NextResponse.json({ deleted: true })
}
