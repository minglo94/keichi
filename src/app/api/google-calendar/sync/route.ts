/**
 * POST /api/google-calendar/sync
 *
 * Manual sync trigger — useful in two scenarios:
 *   A. User just connected Google Calendar and wants to push historical events
 *   B. User wants to force a re-sync after a period offline
 *
 * Performs a full sync:
 *   1. Backfill: push all local CalendarEvents with no googleEventId → Google
 *   2. Pull: incremental sync (Google → website) using syncToken
 *
 * Body (optional):
 *   { "direction": "push" | "pull" | "both" }
 *   Default: "both"
 *
 * Returns:
 *   { pushed: number, pulled: number }
 */

import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import {
  isConnected,
  backfillUnsyncedEvents,
  backfillCommitteeEventsForUser,
  processIncrementalSync,
} from "@/lib/google-calendar"
import { z } from "zod"

const bodySchema = z.object({
  direction: z.enum(["push", "pull", "both"]).default("both"),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const connected = await isConnected(session.user.id)
  if (!connected) {
    return NextResponse.json({ error: "Google Calendar not connected" }, { status: 400 })
  }

  let body: { direction: "push" | "pull" | "both" } = { direction: "both" }
  try {
    const raw = await req.json().catch(() => ({}))
    body = bodySchema.parse(raw)
  } catch {
    // use defaults
  }

  let pushed = 0
  let pulled = 0

  if (body.direction === "push" || body.direction === "both") {
    // Own events that never got a googleEventId...
    pushed = await backfillUnsyncedEvents(session.user.id)
    // ...plus school-wide + this user's committees' events authored by others.
    // Without this, a teacher only ever sees events they created themselves.
    pushed += await backfillCommitteeEventsForUser(session.user.id)
  }

  if (body.direction === "pull" || body.direction === "both") {
    pulled = await processIncrementalSync(session.user.id)
  }

  return NextResponse.json({ pushed, pulled })
}
