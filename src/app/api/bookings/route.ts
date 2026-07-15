import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const bookingSchema = z.object({
  resourceId: z.string(),
  startTime: z.string().transform(v => new Date(v)),
  endTime: z.string().transform(v => new Date(v)),
  purpose: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const resourceId = searchParams.get("resourceId")
  const start = searchParams.get("start")
  const end = searchParams.get("end")

  const bookings = await prisma.booking.findMany({
    where: {
      ...(resourceId ? { resourceId } : {}),
      ...(start && end ? {
        startTime: { gte: new Date(start) },
        endTime: { lte: new Date(end) },
      } : {}),
    },
    include: {
      resource: true,
      user: {
        select: { id: true, name: true }
      }
    },
    orderBy: { startTime: "asc" },
  })

  return NextResponse.json(bookings)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const data = bookingSchema.parse(body)

    // Conflict detection
    const conflict = await prisma.booking.findFirst({
      where: {
        resourceId: data.resourceId,
        OR: [
          {
            startTime: { lt: data.endTime },
            endTime: { gt: data.startTime },
          }
        ]
      }
    })

    if (conflict) {
      return NextResponse.json({ error: "Booking conflict detected" }, { status: 409 })
    }

    const booking = await prisma.booking.create({
      data: {
        ...data,
        userId: session.user.id,
      }
    })

    return NextResponse.json(booking, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
