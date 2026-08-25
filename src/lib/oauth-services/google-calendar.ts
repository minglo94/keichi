/**
 * oauth-services/google-calendar.ts
 * ──────────────────────────────────────────────────────────────
 * OAuth service handler for Google Calendar.
 *
 * Registered in oauth-services/index.ts under service = "google-calendar".
 * Invoked by /api/oauth/callback after code exchange succeeds.
 * ──────────────────────────────────────────────────────────────
 */

import {
  saveConnection,
  ensureDedicatedCalendar,
  subscribeToCalendarWatch,
  backfillCommitteeEventsForUser,
} from "@/lib/google-calendar"
import type { OAuthServiceHandler, OAuthTokens } from "./types"

export const googleCalendarHandler: OAuthServiceHandler = {
  service: "google-calendar",

  scopes: [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ],

  async handleCallback(userId: string, tokens: OAuthTokens) {
    if (!tokens.refresh_token) {
      // Forced prompt=consent in connect route, so this should not happen.
      // If it does, the user had a prior grant that Google cached — they need
      // to revoke at https://myaccount.google.com/permissions and try again.
      throw new Error("no_refresh_token")
    }

    // 1. Ensure dedicated "基智行政平台" calendar exists
    const googleCalendarId = await ensureDedicatedCalendar(userId, tokens.access_token)
    if (!googleCalendarId) throw new Error("calendar_create")

    // 2. Persist connection
    await saveConnection({
      userId,
      googleCalendarId,
      accessToken:  tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn:    tokens.expires_in,
    })

    // 3. Subscribe to push notifications for bidirectional sync (best-effort)
    await subscribeToCalendarWatch(userId).catch((err) => {
      console.error("[OAuthService:google-calendar] watch subscribe failed:", err)
    })

    // 4. Push existing school-wide (SCHOOL) and this teacher's own committees'
    //    events into their calendar right away, rather than waiting for the
    //    next edit to one of those events.
    backfillCommitteeEventsForUser(userId).catch((err) => {
      console.error("[OAuthService:google-calendar] committee backfill failed:", err)
    })

    // Return params appended to the success redirect URL
    return { gcal_connected: "1" }
  },
}
