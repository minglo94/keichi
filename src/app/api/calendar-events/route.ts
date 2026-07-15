import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isTeacherOrAdmin } from "@/lib/roles"
import { logToObsidian } from "@/lib/obsidian-log"
import { z } from "zod"

const createSchema = z.object({
  title:       z.string().min(1).max(200),
  startDate:   z.string(),
  endDate:     z.string().optional(),
  allDay:      z.boolean().default(true),
  description: z.string().optional(),
  committee:   z.enum(["ADMIN", "DISCIPLINE", "IT", "CURRICULUM", "ECA"]).optional(),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const month = searchParams.get("month") // YYYY-MM

  let startFilter: Date | undefined
  let endFilter:   Date | undefined

  if (month) {
    const [y, m] = month.split("-").map(Number)
    startFilter = new Date(y, m - 1, 1)
    endFilter   = new Date(y, m, 1)
  }

  const events = await prisma.calendarEvent.findMany({
    where: {
      ...(startFilter && endFilter
        ? { startDate: { gte: startFilter, lt: endFilter } }
        : {}),
    },
    orderBy: { startDate: "asc" },
    include: { author: { select: { id: true, name: true } } },
  })

  return NextResponse.json(events)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body  = await req.json()
  const data  = createSchema.parse(body)

  const event = await prisma.calendarEvent.create({
    data: {
      ...data,
      startDate: new Date(data.startDate),
      endDate:   data.endDate ? new Date(data.endDate) : undefined,
      authorId:  session.user.id,
    },
    include: { author: { select: { id: true, name: true } } },
  })

  logToObsidian(
    "Calendar Event Created",
    `Event "${event.title}" created by ${session.user.name} (${session.user.id})`
  )

  return NextResponse.json(event, { status: 201 })
}
