import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isTeacherOrAdmin } from "@/lib/roles"
import { logToObsidian } from "@/lib/obsidian-log"
import { createGoogleEvent, isConnected, fanOutCommitteeEvent } from "@/lib/google-calendar"
import { z } from "zod"
import type { CommitteeType } from "@prisma/client"

const createSchema = z.object({
  title:       z.string().min(1).max(200),
  startDate:   z.string(),
  endDate:     z.string().optional(),
  allDay:      z.boolean().default(true),
  description: z.string().optional(),
  committee:   z.enum(["ADMIN", "DISCIPLINE", "IT", "CURRICULUM", "ECA", "SCHOOL"]).optional(),
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

  // Students only see school-wide events and 課外活動 — the other committees
  // (行政 / 訓育 / 資訊科技 / 課程發展) are internal staff business. Filtered
  // here rather than hidden in the UI so the data never reaches the client.
  const studentVisible = { committee: { in: ["SCHOOL", "ECA"] as CommitteeType[] } }

  const events = await prisma.calendarEvent.findMany({
    where: {
      ...(startFilter && endFilter
        ? { startDate: { gte: startFilter, lt: endFilter } }
        : {}),
      ...(session.user.role === "STUDENT" ? studentVisible : {}),
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

  // Google Calendar sync — best-effort, but AWAITED. Fire-and-forget here
  // silently breaks sync: the response ends the request context, so the
  // promise gets dropped part-way through — the event reaches Google, but the
  // googleEventId write-back never lands, leaving the event unlinked and
  // impossible to update/delete on Google later.
  try {
    if (await isConnected(session.user.id)) {
      await createGoogleEvent(session.user.id, event)
    }
    // Committee events also fan out to every other relevant connected teacher
    // (SCHOOL → everyone; other committees → that committee's members)
    if (event.committee) {
      await fanOutCommitteeEvent(event)
    }
  } catch (err) {
    // Never fail the request over a Google problem — the event is already saved.
    console.error("[GCal] create sync error:", err)
  }

  return NextResponse.json(event, { status: 201 })
}
