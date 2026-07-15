// ============================================================
// Pusher Server Utility
// Handles all server-side event broadcasting
// ============================================================
import PusherServer from 'pusher'
import type {
  PusherPointsAwardedPayload,
  PusherMissionApprovedPayload,
  PusherNewMissionPayload,
} from '@/types/mission'

// Singleton pattern — reuse across hot-reloads in dev
const globalForPusher = globalThis as unknown as { pusher: PusherServer }

export const pusherServer =
  globalForPusher.pusher ||
  new PusherServer({
    appId: process.env.PUSHER_APP_ID!,
    key: process.env.NEXT_PUBLIC_PUSHER_KEY!,
    secret: process.env.PUSHER_SECRET!,
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    useTLS: true,
  })

if (process.env.NODE_ENV !== 'production') globalForPusher.pusher = pusherServer

// ─────────────────────────────────────────
// Channel name helpers
// ─────────────────────────────────────────

export const channels = {
  class: (classId: string) => `class-${classId}`,
  privateUser: (userId: string) => `private-user-${userId}`,
}

// ─────────────────────────────────────────
// Typed broadcast functions
// ─────────────────────────────────────────

/** Broadcast to all students in a class when points are awarded */
export async function broadcastPointsAwarded(
  classId: string,
  payload: PusherPointsAwardedPayload
) {
  return pusherServer.trigger(channels.class(classId), 'points-awarded', payload)
}

/** Broadcast to class when a submission is approved */
export async function broadcastMissionApproved(
  classId: string,
  payload: PusherMissionApprovedPayload
) {
  return pusherServer.trigger(channels.class(classId), 'mission-approved', payload)
}

/** Broadcast to class when teacher publishes a new mission */
export async function broadcastNewMission(
  classId: string,
  payload: PusherNewMissionPayload
) {
  return pusherServer.trigger(channels.class(classId), 'new-mission', payload)
}

/** Send private feedback to a specific student */
export async function sendSubmissionFeedback(
  userId: string,
  payload: { missionTitle: string; status: 'REJECTED'; feedback: string }
) {
  return pusherServer.trigger(
    channels.privateUser(userId),
    'submission-feedback',
    payload
  )
}
