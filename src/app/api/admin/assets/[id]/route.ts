import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const updateSchema = z.object({
  name: z.string().optional(),
  type: z.enum(["IPAD", "LAPTOP", "PROJECTOR", "OTHER"]).optional(),
  status: z.enum(["AVAILABLE", "LENT", "REPAIR", "RETIRED"]).optional(),
  location: z.string().optional(),
  assignedToId: z.string().nullable().optional(),
  purchaseDate: z.string().optional().transform(v => v ? new Date(v) : undefined),
})

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const asset = await prisma.asset.findUnique({
    where: { id: params.id },
    include: {
      assignedTo: {
        select: { id: true, name: true, email: true }
      },
      history: {
        include: {
          user: {
            select: { name: true }
          }
        },
        orderBy: { createdAt: "desc" }
      }
    }
  })

  if (!asset) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 })
  }

  return NextResponse.json(asset)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const body = await req.json()
    const data = updateSchema.parse(body)

    const currentAsset = await prisma.asset.findUnique({
      where: { id: params.id }
    })

    if (!currentAsset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 })
    }

    const asset = await prisma.asset.update({
      where: { id: params.id },
      data: {
        ...data,
        // If status changed, we might want to log it elsewhere, 
        // but for now we'll do it in a dedicated log endpoint or here.
      }
    })

    // Log the change if status or assignment changed
    if (data.status || data.assignedToId !== undefined) {
      await prisma.assetLog.create({
        data: {
          assetId: params.id,
          userId: session.user.id,
          action: data.assignedToId === null ? "CHECK_IN" : (data.assignedToId ? "CHECK_OUT" : "UPDATE"),
          fromStatus: currentAsset.status,
          toStatus: data.status || currentAsset.status,
          note: body.note || "Updated via asset management",
        }
      })
    }

    return NextResponse.json(asset)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.asset.delete({
    where: { id: params.id }
  })

  return new NextResponse(null, { status: 204 })
}
