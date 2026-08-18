import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isAdmin, canEditCommittee } from "@/lib/roles"
import { logToObsidian } from "@/lib/obsidian-log"
import { updateGoogleEvent, deleteGoogleEvent, isConnected } from "@/lib/google-calendar"
import { z } from "zod"

const patchSchema = z.object({
  title:       z.string().min(1).max(200).optional(),
  startDate:   z.string().optional(),
  endDate:     z.string().nullable().optional(),
  allDay:      z.boolean().optional(),
  description: z.string().optional(),
  committee:   z.enum(["ADMIN", "DISCIPLINE", "IT", "CURRICULUM", "ECA", "SCHOOL"]).nullable().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const event = await prisma.calendarEvent.findUnique({ where: { id: params.id } })
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Only a global ADMIN or the president (chair) of the event's committee may
  // edit it. Events with no committee (全校) are ADMIN-only.
  const allowed =
    isAdmin(session.user.role) ||
    (event.committee
      ? await canEditCommittee(session.user.id, session.user.role, event.committee)
      : false)
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const data    = patchSchema.parse(await req.json())
  const updated = await prisma.calendarEvent.update({
    where: { id: params.id },
    data: {
      ...data,
      ...(data.startDate ? { startDate: new Date(data.startDate) } : {}),
      ...(data.endDate !== undefined
        ? { endDate: data.endDate ? new Date(data.endDate) : null }
        : {}),
    },
    include: { author: { select: { id: true, name: true } } },
  })

  logToObsidian(
    "Calendar Event Updated",
    `Event "${updated.title}" (${updated.id}) updated by ${session.user.name}`
  )

  // Google Calendar sync — best-effort, non-blocking
  isConnected(session.user.id)
    .then((connected) => {
      if (connected) return updateGoogleEvent(session.user.id, updated)
    })
    .catch((err) => console.error("[GCal] updateGoogleEvent error:", err))

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const event = await prisma.calendarEvent.findUnique({ where: { id: params.id } })
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Only a global ADMIN or the president (chair) of the event's committee may
  // delete it. Events with no committee (全校) are ADMIN-only.
  const allowed =
    isAdmin(session.user.role) ||
    (event.committee
      ? await canEditCommittee(session.user.id, session.user.role, event.committee)
      : false)
  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Capture Google sync fields before deletion
  const { googleEventId } = event

  await prisma.calendarEvent.delete({ where: { id: params.id } })

  logToObsidian(
    "Calendar Event Deleted",
    `Event "${event.title}" (${event.id}) deleted by ${session.user.name}`
  )

  // Google Calendar sync — best-effort, non-blocking
  if (googleEventId) {
    isConnected(session.user.id)
      .then(async (connected) => {
        if (!connected) return
        const { prisma: db } = await import("@/lib/prisma")
        const conn = await db.googleCalendarConnection.findUnique({
          where:  { userId: session.user.id },
          select: { googleCalendarId: true },
        })
        if (conn) {
          await deleteGoogleEvent(session.user.id, googleEventId, conn.googleCalendarId)
        }
      })
      .catch((err) => console.error("[GCal] deleteGoogleEvent error:", err))
  }

  return NextResponse.json({ deleted: true })
}
