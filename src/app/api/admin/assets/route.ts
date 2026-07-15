import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const assetSchema = z.object({
  tag: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(["IPAD", "LAPTOP", "PROJECTOR", "OTHER"]),
  status: z.enum(["AVAILABLE", "LENT", "REPAIR", "RETIRED"]).default("AVAILABLE"),
  location: z.string().optional(),
  purchaseDate: z.string().optional().transform(v => v ? new Date(v) : undefined),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const type = searchParams.get("type")
  const status = searchParams.get("status")

  const assets = await prisma.asset.findMany({
    where: {
      ...(type ? { type: type as any } : {}),
      ...(status ? { status: status as any } : {}),
    },
    include: {
      assignedTo: {
        select: { id: true, name: true, email: true }
      }
    },
    orderBy: { tag: "asc" },
  })

  return NextResponse.json(assets)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = assetSchema.parse(body)

    const existing = await prisma.asset.findUnique({
      where: { tag: data.tag }
    })

    if (existing) {
      return NextResponse.json({ error: "Asset tag already exists" }, { status: 400 })
    }

    const asset = await prisma.asset.create({
      data
    })

    return NextResponse.json(asset, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
