/**
 * POST /api/google-calendar/disconnect
 *
 * Disconnects the user's Google Calendar:
 *   1. Stops the active Watch channel (if any)
 *   2. Deletes the GoogleCalendarConnection record
 *   3. Clears googleEventId + syncedAt on all of the user's CalendarEvents
 *      (so they can be re-synced if user reconnects)
 *
 * Does NOT delete events from Google Calendar — the "基智行政平台" calendar
 * and its events remain in the user's Google account.
 */

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { disconnectCalendar } from "@/lib/google-calendar"
import { prisma } from "@/lib/prisma"

export async function POST() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Stop watch + delete connection
  await disconnectCalendar(session.user.id)

  // Clear sync metadata on local events authored by this user
  // so they can be re-pushed if the user reconnects
  await prisma.calendarEvent.updateMany({
    where:  { authorId: session.user.id },
    data:   { googleEventId: null, syncedAt: null },
  })

  return NextResponse.json({ disconnected: true })
}
