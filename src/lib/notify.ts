import { prisma } from "@/lib/prisma"
import { pusherServer, channels } from "@/lib/pusher"

export type NotificationType = "ANNOUNCEMENT" | "DOC_APPROVAL" | "BEHAVIOR" | "GENERAL"

export type NotifyInput = {
  userId: string
  type:   NotificationType
  title:  string
  body?:  string
  link?:  string
}

/**
 * Persist an in-app notification and push a real-time `notification` event to
 * the recipient's private channel. Best-effort: DB and Pusher failures are
 * swallowed so a notification never breaks the triggering request.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    const n = await prisma.notification.create({
      data: {
        userId: input.userId,
        type:   input.type,
        title:  input.title,
        body:   input.body,
        link:   input.link,
      },
    })
    try {
      await pusherServer.trigger(channels.privateUser(input.userId), "notification", {
        id:    n.id,
        type:  n.type,
        title: n.title,
        body:  n.body,
        link:  n.link,
        createdAt: n.createdAt,
      })
    } catch {}
  } catch (err) {
    console.error("notify failed:", err)
  }
}

/** Fan-out a notification to many recipients (e.g. an announcement to all staff). */
export async function notifyMany(userIds: string[], base: Omit<NotifyInput, "userId">): Promise<void> {
  if (userIds.length === 0) return
  try {
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({
        userId,
        type:  base.type,
        title: base.title,
        body:  base.body,
        link:  base.link,
      })),
    })
    // Real-time nudge per recipient (best-effort).
    await Promise.allSettled(
      userIds.map((userId) =>
        pusherServer.trigger(channels.privateUser(userId), "notification", {
          type: base.type, title: base.title, body: base.body, link: base.link,
        })
      )
    )
  } catch (err) {
    console.error("notifyMany failed:", err)
  }
}
