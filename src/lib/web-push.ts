// ============================================================
// Web Push (PWA notifications)
//
// Delivers OS-level notifications to installed PWAs — the piece Pusher
// Channels cannot do, since Channels only reaches a page that is currently
// open. Used by notify()/notifyMany() in src/lib/notify.ts alongside the
// live Pusher event.
//
// Requires VAPID keys (see .env.example). Generate a pair with:
//   npx web-push generate-vapid-keys
//
// iOS note: Safari only delivers Web Push when the site has been added to
// the Home Screen — it does NOT work in a browser tab (iOS 16.4+).
// ============================================================
import webpush from "web-push"
import { prisma } from "@/lib/prisma"

const PUBLIC_KEY  = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY
const SUBJECT     = process.env.VAPID_SUBJECT || "mailto:admin@keichi.edu.hk"

let configured = false
if (PUBLIC_KEY && PRIVATE_KEY) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY)
  configured = true
}

/** True when VAPID keys are set — lets the UI explain why push is unavailable. */
export function isPushConfigured(): boolean {
  return configured
}

export type PushPayload = {
  title: string
  body?: string
  link?: string
}

/**
 * Send a push notification to every device a user has registered.
 *
 * Best-effort and never throws: a notification must never break the request
 * that triggered it. Subscriptions the push service reports as gone
 * (404/410 — app deleted, permission revoked) are pruned automatically.
 */
export async function sendPushToUsers(userIds: string[], payload: PushPayload): Promise<number> {
  if (!configured || userIds.length === 0) return 0

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  })
  if (subs.length === 0) return 0

  const body = JSON.stringify(payload)
  const stale: string[] = []
  let sent = 0

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
      )
      sent++
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode
      // 404/410 = the subscription no longer exists on the push service.
      if (status === 404 || status === 410) {
        stale.push(s.endpoint)
      } else {
        console.error("[push] send failed:", status, (err as Error)?.message)
      }
    }
  }))

  if (stale.length > 0) {
    await prisma.pushSubscription
      .deleteMany({ where: { endpoint: { in: stale } } })
      .catch(() => {})
  }

  return sent
}
