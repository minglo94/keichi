import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const patchSchema = z.object({
  title:      z.string().min(1).max(200).optional(),
  body:       z.string().min(1).max(10000).optional(),
  committee:  z.enum(["ADMIN", "DISCIPLINE", "IT", "CURRICULUM", "ECA"]).nullable().optional(),
  target:     z.enum(["ALL", "ADMIN", "DISCIPLINE", "IT", "CURRICULUM", "ECA", "CLASS"]).optional(),
  priority:   z.enum(["NORMAL", "IMPORTANT", "URGENT"]).optional(),
  status:     z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional(),
  categoryId: z.string().nullable().optional(),
  pinned:     z.boolean().optional(),
  publishAt:  z.string().optional().transform(v => v ? new Date(v) : undefined),
})

async function getOwned(id: string, userId: string) {
  const ann = await prisma.announcement.findUnique({ where: { id } })
  if (!ann) return null
  if (ann.authorId !== userId) return null
  return ann
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ann = await prisma.announcement.findUnique({
    where: { id: params.id },
    include: {
      author:   { select: { id: true, name: true, image: true } },
      category: { select: { id: true, name: true, committee: true } },
    },
  })
  if (!ann) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json(ann)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const owned = await getOwned(params.id, session.user.id)
  if (!owned) return NextResponse.json({ error: "Not found or forbidden" }, { status: 403 })

  const data = patchSchema.parse(await req.json())

  const updated = await prisma.announcement.update({
    where: { id: params.id },
    data,
    include: {
      author:   { select: { id: true, name: true, image: true } },
      category: { select: { id: true, name: true, committee: true } },
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const owned = await getOwned(params.id, session.user.id)
  if (!owned) return NextResponse.json({ error: "Not found or forbidden" }, { status: 403 })

  await prisma.announcement.delete({ where: { id: params.id } })

  return NextResponse.json({ deleted: true })
}
