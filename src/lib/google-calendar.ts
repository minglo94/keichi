/**
 * google-calendar.ts
 * ─────────────────────────────────────────────────────────────────
 * Core infrastructure service for Google Calendar sync.
 *
 * Responsibilities:
 *  - Token management: refresh access_token when expired, persist to DB
 *  - Calendar management: ensure dedicated "基智行政平台" calendar exists
 *  - CRUD: create / update / delete events on Google Calendar
 *  - Watch channels: subscribe to push notifications for bidirectional sync
 *  - Webhook processing: incremental sync (syncToken) when Google sends a ping
 *
 * All operations are best-effort — they NEVER throw to the caller on
 * network/Google errors. They log and return null / false instead.
 * The caller's DB operation should already have succeeded before we reach here.
 * ─────────────────────────────────────────────────────────────────
 */

import { prisma } from "@/lib/prisma"
import type { CalendarEvent, GoogleCalendarConnection } from "@prisma/client"

// ─── Constants ───────────────────────────────────────────────────

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_CALENDAR_BASE = "https://www.googleapis.com/calendar/v3"
const CALENDAR_NAME = "基智行政平台"
const CALENDAR_COLOR = "#0B8043" // sage green
// Refresh the token if it expires within 5 minutes
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
// Watch channels expire in max 7 days; renew when < 2 days remain
const WATCH_RENEW_THRESHOLD_MS = 2 * 24 * 60 * 60 * 1000

// ─── Types ───────────────────────────────────────────────────────

export interface GCalEvent {
  id?: string
  summary: string
  description?: string
  start: { date?: string; dateTime?: string; timeZone?: string }
  end: { date?: string; dateTime?: string; timeZone?: string }
  updated?: string // ISO string from Google
}

export interface SyncResult {
  success: boolean
  googleEventId?: string
  error?: string
}

// ─── Token Management ────────────────────────────────────────────

/**
 * Returns a valid access_token for the user.
 * If the stored token is about to expire, automatically refreshes it
 * using the refresh_token and persists the new token to DB.
 * Returns null if the user has no GoogleCalendarConnection.
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const conn = await prisma.googleCalendarConnection.findUnique({
    where: { userId },
  })
  if (!conn) return null

  // Still valid
  if (conn.tokenExpiresAt.getTime() - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    return conn.accessToken
  }

  // Need to refresh
  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id:     process.env.AUTH_GOOGLE_ID!,
        client_secret: process.env.AUTH_GOOGLE_SECRET!,
        refresh_token: conn.refreshToken,
        grant_type:    "refresh_token",
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error("[GCal] token refresh failed:", err)
      return null
    }

    const data = await res.json()
    const expiresAt = new Date(Date.now() + data.expires_in * 1000)

    await prisma.googleCalendarConnection.update({
      where: { userId },
      data: {
        accessToken:   data.access_token,
        tokenExpiresAt: expiresAt,
        // Google sometimes issues a new refresh_token on refresh
        ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
      },
    })

    return data.access_token as string
  } catch (err) {
    console.error("[GCal] token refresh error:", err)
    return null
  }
}

// ─── Fetch Helper ────────────────────────────────────────────────

async function gcalFetch(
  userId: string,
  path: string,
  options: RequestInit = {},
): Promise<{ ok: boolean; data?: any; status?: number }> {
  const token = await getValidAccessToken(userId)
  if (!token) return { ok: false, error: "no_token" } as any

  const res = await fetch(`${GOOGLE_CALENDAR_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  })

  if (!res.ok) {
    const text = await res.text()
    console.error(`[GCal] ${options.method ?? "GET"} ${path} failed (${res.status}):`, text)
    return { ok: false, status: res.status }
  }

  const data = res.status === 204 ? null : await res.json()
  return { ok: true, data }
}

// ─── Calendar Management ─────────────────────────────────────────

/**
 * Ensures the dedicated "基智行政平台" calendar exists in the user's Google account.
 * If it does not exist, creates it.
 * Returns the calendarId.
 */
export async function ensureDedicatedCalendar(userId: string, accessToken?: string): Promise<string | null> {
  const token = accessToken ?? (await getValidAccessToken(userId))
  if (!token) return null

  // 1. Check if calendarId is already stored
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId } })
  if (conn?.googleCalendarId) {
    // Verify it still exists on Google's side
    const check = await gcalFetch(userId, `/calendars/${encodeURIComponent(conn.googleCalendarId)}`)
    if (check.ok) return conn.googleCalendarId
    // If not found, fall through to create a new one
  }

  // 2. Create a new dedicated calendar
  try {
    const res = await fetch(`${GOOGLE_CALENDAR_BASE}/calendars`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary:  CALENDAR_NAME,
        timeZone: "Asia/Hong_Kong",
      }),
    })

    if (!res.ok) {
      console.error("[GCal] create calendar failed:", await res.text())
      return null
    }

    const cal = await res.json()

    // Set a distinctive color for the calendar
    await fetch(
      `${GOOGLE_CALENDAR_BASE}/users/me/calendarList/${encodeURIComponent(cal.id)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ backgroundColor: CALENDAR_COLOR, foregroundColor: "#ffffff" }),
      },
    )

    return cal.id as string
  } catch (err) {
    console.error("[GCal] ensureDedicatedCalendar error:", err)
    return null
  }
}

// ─── Event CRUD ──────────────────────────────────────────────────

/**
 * Converts a CalendarEvent DB record to a Google Calendar event payload.
 */
function toGCalPayload(event: CalendarEvent): GCalEvent {
  if (event.allDay) {
    // All-day events use date format (YYYY-MM-DD)
    const startDate = event.startDate.toISOString().split("T")[0]
    // For all-day events, Google's end is exclusive (day after last day)
    const endRaw = event.endDate ?? event.startDate
    const endDate = new Date(endRaw)
    endDate.setDate(endDate.getDate() + 1)
    const endDateStr = endDate.toISOString().split("T")[0]
    return {
      summary:     event.title,
      description: event.description ?? undefined,
      start: { date: startDate },
      end:   { date: endDateStr },
    }
  }

  return {
    summary:     event.title,
    description: event.description ?? undefined,
    start: { dateTime: event.startDate.toISOString(), timeZone: "Asia/Hong_Kong" },
    end:   {
      dateTime: (event.endDate ?? new Date(event.startDate.getTime() + 3600_000)).toISOString(),
      timeZone: "Asia/Hong_Kong",
    },
  }
}

/**
 * Creates a new event on Google Calendar and stores the returned googleEventId
 * back into the CalendarEvent DB row.
 */
export async function createGoogleEvent(userId: string, event: CalendarEvent): Promise<SyncResult> {
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId } })
  if (!conn) return { success: false, error: "not_connected" }

  const result = await gcalFetch(
    userId,
    `/calendars/${encodeURIComponent(conn.googleCalendarId)}/events`,
    { method: "POST", body: JSON.stringify(toGCalPayload(event)) },
  )

  if (!result.ok) return { success: false, error: "google_error" }

  const googleEventId = result.data.id as string

  // Persist the Google event ID + sync timestamp
  await prisma.calendarEvent.update({
    where: { id: event.id },
    data:  { googleEventId, syncedAt: new Date() },
  })

  return { success: true, googleEventId }
}

/**
 * Updates an existing Google Calendar event.
 * Uses PATCH so only changed fields are sent.
 */
export async function updateGoogleEvent(userId: string, event: CalendarEvent): Promise<SyncResult> {
  if (!event.googleEventId) {
    // No Google event yet — create one instead
    return createGoogleEvent(userId, event)
  }

  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId } })
  if (!conn) return { success: false, error: "not_connected" }

  const result = await gcalFetch(
    userId,
    `/calendars/${encodeURIComponent(conn.googleCalendarId)}/events/${event.googleEventId}`,
    { method: "PATCH", body: JSON.stringify(toGCalPayload(event)) },
  )

  if (!result.ok) return { success: false, error: "google_error" }

  await prisma.calendarEvent.update({
    where: { id: event.id },
    data:  { syncedAt: new Date() },
  })

  return { success: true, googleEventId: event.googleEventId }
}

/**
 * Deletes an event from Google Calendar.
 * If the event is not found on Google (404), treats it as success.
 */
export async function deleteGoogleEvent(
  userId: string,
  googleEventId: string,
  calendarId: string,
): Promise<SyncResult> {
  const result = await gcalFetch(
    userId,
    `/calendars/${encodeURIComponent(calendarId)}/events/${googleEventId}`,
    { method: "DELETE" },
  )

  // 404 = already gone → treat as success
  if (!result.ok && result.status !== 404) {
    return { success: false, error: "google_error" }
  }

  return { success: true }
}

// ─── Watch / Push Notification ───────────────────────────────────

/**
 * Subscribes to push notifications for the user's dedicated calendar.
 * Google will POST to /api/google-calendar/webhook whenever an event changes.
 * Stores the channelId + resourceId + expiry in DB.
 */
export async function subscribeToCalendarWatch(userId: string): Promise<boolean> {
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId } })
  if (!conn) return false

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    console.warn("[GCal] NEXT_PUBLIC_APP_URL not set — watch not registered")
    return false
  }

  // Stop any existing watch channel first
  if (conn.watchChannelId && conn.watchResourceId) {
    await stopCalendarWatch(userId).catch(() => {})
  }

  const channelId = `gcal-${userId}-${Date.now()}`
  const webhookUrl = `${appUrl}/api/google-calendar/webhook`

  const result = await gcalFetch(
    userId,
    `/calendars/${encodeURIComponent(conn.googleCalendarId)}/events/watch`,
    {
      method: "POST",
      body: JSON.stringify({
        id:      channelId,
        type:    "web_hook",
        address: webhookUrl,
        // TTL in seconds — request 7 days (Google may return less)
        params:  { ttl: "604800" },
      }),
    },
  )

  if (!result.ok) {
    console.error("[GCal] watch subscribe failed for user", userId)
    return false
  }

  const expiry = new Date(parseInt(result.data.expiration))

  await prisma.googleCalendarConnection.update({
    where: { userId },
    data: {
      watchChannelId:  channelId,
      watchResourceId: result.data.resourceId,
      watchExpiry:     expiry,
    },
  })

  return true
}

/**
 * Stops the active watch channel for a user.
 */
export async function stopCalendarWatch(userId: string): Promise<void> {
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId } })
  if (!conn?.watchChannelId || !conn.watchResourceId) return

  const token = await getValidAccessToken(userId)
  if (!token) return

  await fetch(`${GOOGLE_CALENDAR_BASE}/channels/stop`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      id:         conn.watchChannelId,
      resourceId: conn.watchResourceId,
    }),
  }).catch((err) => console.error("[GCal] stop watch error:", err))

  await prisma.googleCalendarConnection.update({
    where: { userId },
    data: { watchChannelId: null, watchResourceId: null, watchExpiry: null },
  })
}

/**
 * Renews the watch channel if it's about to expire (< WATCH_RENEW_THRESHOLD_MS remaining).
 * Call this whenever a webhook ping arrives for this user.
 */
export async function renewWatchIfNeeded(userId: string): Promise<void> {
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId } })
  if (!conn?.watchExpiry) return

  const remaining = conn.watchExpiry.getTime() - Date.now()
  if (remaining < WATCH_RENEW_THRESHOLD_MS) {
    await subscribeToCalendarWatch(userId)
  }
}

// ─── Incremental Sync (Google → Website) ─────────────────────────

/**
 * Pulls incremental changes from Google Calendar using the stored syncToken.
 * For each changed event that matches a local CalendarEvent.googleEventId:
 *   - If newer than our local updatedAt → update local record
 *   - If event is cancelled on Google → do nothing (we keep our record,
 *     since user may have deleted it on Google by accident)
 * Updates syncToken in DB after processing.
 *
 * Returns the number of events updated locally.
 */
export async function processIncrementalSync(userId: string): Promise<number> {
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId } })
  if (!conn) return 0

  const token = await getValidAccessToken(userId)
  if (!token) return 0

  // Build the list URL — use syncToken for incremental, or do a full sync if missing
  const calId = encodeURIComponent(conn.googleCalendarId)
  const url = conn.syncToken
    ? `${GOOGLE_CALENDAR_BASE}/calendars/${calId}/events?syncToken=${encodeURIComponent(conn.syncToken)}&showDeleted=true`
    : `${GOOGLE_CALENDAR_BASE}/calendars/${calId}/events?showDeleted=true&orderBy=updated`

  let updatedCount = 0
  let pageToken: string | undefined
  let nextSyncToken: string | undefined

  do {
    const listUrl = pageToken ? `${url}&pageToken=${pageToken}` : url
    const res = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      // 410 Gone = syncToken expired → trigger full re-sync next time
      if (res.status === 410) {
        await prisma.googleCalendarConnection.update({
          where: { userId },
          data: { syncToken: null },
        })
      } else {
        console.error("[GCal] incremental sync list failed:", res.status, await res.text())
      }
      return updatedCount
    }

    const body = await res.json()
    nextSyncToken = body.nextSyncToken
    pageToken = body.nextPageToken

    const items: GCalEvent[] = body.items ?? []

    // Collect all googleEventIds in this batch
    const googleIds = items.map((e) => e.id!).filter(Boolean)
    if (googleIds.length === 0) continue

    // Find matching local CalendarEvents
    const localEvents = await prisma.calendarEvent.findMany({
      where: { googleEventId: { in: googleIds } },
    })
    const localMap = new Map(localEvents.map((e) => [e.googleEventId!, e]))

    for (const gEvent of items) {
      if (!gEvent.id) continue
      const local = localMap.get(gEvent.id)
      if (!local) continue // not our event → skip

      // Deleted on Google side
      if ((gEvent as any).status === "cancelled") {
        // We intentionally do NOT delete locally — the local event is source of truth
        // unless the user deleted from our UI (which calls DELETE on Google then DB)
        continue
      }

      // Compare timestamps: only update if Google's version is newer
      const googleUpdated = gEvent.updated ? new Date(gEvent.updated) : null
      if (!googleUpdated) continue

      const localUpdated = local.updatedAt
      if (googleUpdated <= localUpdated) continue // local is newer or same

      // Parse dates from Google event
      let startDate: Date
      let endDate: Date | null = null
      let allDay = false

      if (gEvent.start.date) {
        allDay = true
        startDate = new Date(gEvent.start.date + "T00:00:00+08:00")
        if (gEvent.end.date) {
          // Google end is exclusive for all-day — subtract 1 day
          const endRaw = new Date(gEvent.end.date + "T00:00:00+08:00")
          endRaw.setDate(endRaw.getDate() - 1)
          endDate = endRaw
        }
      } else if (gEvent.start.dateTime) {
        startDate = new Date(gEvent.start.dateTime)
        endDate = gEvent.end.dateTime ? new Date(gEvent.end.dateTime) : null
      } else {
        continue
      }

      await prisma.calendarEvent.update({
        where: { id: local.id },
        data: {
          title:       gEvent.summary ?? local.title,
          description: gEvent.description ?? null,
          startDate,
          endDate,
          allDay,
          syncedAt:    new Date(),
        },
      })
      updatedCount++
    }
  } while (pageToken)

  // Persist the new syncToken
  if (nextSyncToken) {
    await prisma.googleCalendarConnection.update({
      where: { userId },
      data: { syncToken: nextSyncToken },
    })
  }

  return updatedCount
}

// ─── Bulk / Backfill Sync ────────────────────────────────────────

/**
 * Pushes all unsynced CalendarEvents (googleEventId IS NULL) authored by
 * the user to their Google Calendar.
 * Used when a user connects Google Calendar after events were already created.
 * Returns the count of events successfully synced.
 */
export async function backfillUnsyncedEvents(userId: string): Promise<number> {
  const conn = await prisma.googleCalendarConnection.findUnique({ where: { userId } })
  if (!conn) return 0

  const unsynced = await prisma.calendarEvent.findMany({
    where: { authorId: userId, googleEventId: null },
    orderBy: { startDate: "asc" },
  })

  let count = 0
  for (const event of unsynced) {
    const result = await createGoogleEvent(userId, event)
    if (result.success) count++
  }

  return count
}

/**
 * Performs a full sync for a user:
 * 1. Backfills unsynced events (website → Google)
 * 2. Runs incremental sync to pull any Google-side changes (Google → website)
 */
export async function fullSync(userId: string): Promise<{ pushed: number; pulled: number }> {
  const pushed = await backfillUnsyncedEvents(userId)
  const pulled = await processIncrementalSync(userId)
  return { pushed, pulled }
}

// ─── Connection Helpers ───────────────────────────────────────────

/**
 * Checks whether a user has an active Google Calendar connection.
 */
export async function isConnected(userId: string): Promise<boolean> {
  const conn = await prisma.googleCalendarConnection.findUnique({
    where: { userId },
    select: { id: true },
  })
  return !!conn
}

/**
 * Saves a new GoogleCalendarConnection (or replaces an existing one).
 * Called from the OAuth callback after a successful authorization.
 */
export async function saveConnection(params: {
  userId: string
  googleCalendarId: string
  accessToken: string
  refreshToken: string
  expiresIn: number
}): Promise<GoogleCalendarConnection> {
  const tokenExpiresAt = new Date(Date.now() + params.expiresIn * 1000)

  return prisma.googleCalendarConnection.upsert({
    where: { userId: params.userId },
    create: {
      userId:          params.userId,
      googleCalendarId: params.googleCalendarId,
      accessToken:     params.accessToken,
      refreshToken:    params.refreshToken,
      tokenExpiresAt,
    },
    update: {
      googleCalendarId: params.googleCalendarId,
      accessToken:     params.accessToken,
      refreshToken:    params.refreshToken,
      tokenExpiresAt,
      // Reset sync state when reconnecting
      syncToken:       null,
      watchChannelId:  null,
      watchResourceId: null,
      watchExpiry:     null,
    },
  })
}

/**
 * Removes the GoogleCalendarConnection for a user, also stopping any active watch.
 */
export async function disconnectCalendar(userId: string): Promise<void> {
  await stopCalendarWatch(userId).catch(() => {})
  await prisma.googleCalendarConnection.deleteMany({ where: { userId } })
}
