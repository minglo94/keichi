import { isAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

type RouteParams = { params: { groupId: string } }

const addSchema = z.object({ userId: z.string() })

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { userId } = addSchema.parse(await req.json())

  const member = await prisma.groupMember.create({
    data: { groupId: params.groupId, userId },
    include: { user: { select: { id: true, name: true, email: true, image: true } } },
  })

  return NextResponse.json(member, { status: 201 })
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const url = new URL(req.url)
  const userId = url.searchParams.get("userId")
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  await prisma.groupMember.deleteMany({
    where: { groupId: params.groupId, userId },
  })

  return new NextResponse(null, { status: 204 })
}
