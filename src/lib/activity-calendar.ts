import { prisma } from "@/lib/prisma"
import {
  createGoogleEvent, isConnected, fanOutCommitteeEvent,
  deleteGoogleEvent, retractCommitteeEvent,
} from "@/lib/google-calendar"
import type { Activity } from "@prisma/client"

// Publishing an approved activity to the school calendar.
//
// Approved == on the calendar, whichever route created the activity, so both
// the notice path and the direct 活動總覽 path go through here.

/**
 * Create the CalendarEvent for an approved activity and link it back.
 * Idempotent: an activity that already has calendarEventId is left alone, so
 * re-approving cannot produce a second entry.
 */
export async function publishActivityToCalendar(activity: Activity): Promise<string | null> {
  if (activity.calendarEventId) return activity.calendarEventId

  // Times live on the Activity; CalendarEvent has no location column, so the
  // venue folds into the description alongside the time range.
  const fmt = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
  const timeText = activity.endTime
    ? `${fmt(activity.startTime)}–${fmt(activity.endTime)}`
    : fmt(activity.startTime)
  const parts = [timeText, activity.location].filter(Boolean)

  const event = await prisma.calendarEvent.create({
    data: {
      title:       activity.title,
      googleSyncEnabled: activity.googleSyncEnabled,
      startDate:   activity.startTime,
      endDate:     activity.endTime,
      allDay:      false,
      committee:   activity.committee,
      description: parts.join(" · ") || null,
      authorId:    activity.createdById,
    },
  })

  await prisma.activity.update({
    where: { id: activity.id },
    data:  { calendarEventId: event.id },
  })

  // Same Google treatment a hand-made calendar entry gets.
  try {
    if (await isConnected(activity.createdById)) {
      await createGoogleEvent(activity.createdById, event)
    }
    await fanOutCommitteeEvent(event)
  } catch (err) {
    console.error("[activity-calendar] google sync failed:", err)
  }

  return event.id
}

/**
 * Remove the calendar entry an activity published, if any — including its
 * Google copies. Mirrors DELETE /api/calendar-events/[id]; deleting only the
 * row would leave the event stranded on everyone's Google Calendar.
 * Best-effort: a Google failure must not block deleting the activity.
 */
export async function unpublishActivityCalendar(calendarEventId: string | null): Promise<void> {
  if (!calendarEventId) return
  try {
    const event = await prisma.calendarEvent.findUnique({ where: { id: calendarEventId } })
    if (!event) return

    // CalendarEventGoogleSync rows cascade with the event, so read them first.
    const syncs = event.committee
      ? await prisma.calendarEventGoogleSync.findMany({
          where:  { calendarEventId },
          select: { userId: true, googleEventId: true },
        })
      : []

    await prisma.calendarEvent.delete({ where: { id: calendarEventId } })

    if (event.googleEventId && await isConnected(event.authorId)) {
      const conn = await prisma.googleCalendarConnection.findUnique({
        where:  { userId: event.authorId },
        select: { googleCalendarId: true },
      })
      if (conn) await deleteGoogleEvent(event.authorId, event.googleEventId, conn.googleCalendarId)
    }
    if (syncs.length > 0) await retractCommitteeEvent(calendarEventId, syncs)
  } catch (err) {
    console.error("[activity-calendar] delete event failed:", err)
  }
}

