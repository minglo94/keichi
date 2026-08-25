import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isPushConfigured } from "@/lib/web-push"
import { z } from "zod"

// Web Push device registration. One row per device (see PushSubscription).

// GET — whether push is available server-side, and whether THIS device is
// already registered (?endpoint=...), so the UI can show the right state.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const endpoint = new URL(req.url).searchParams.get("endpoint")
  const subscribed = endpoint
    ? !!(await prisma.pushSubscription.findFirst({
        where: { endpoint, userId: session.user.id }, select: { id: true },
      }))
    : false

  return NextResponse.json({ configured: isPushConfigured(), subscribed })
}

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth:   z.string().min(1),
  }),
})

// POST — register (or re-register) this device for the signed-in user.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { endpoint, keys } = subscribeSchema.parse(await req.json())
  const userAgent = req.headers.get("user-agent")?.slice(0, 255) ?? null

  // endpoint is unique — upsert so re-subscribing on the same device (or a
  // device that changed hands) re-points the row rather than failing.
  await prisma.pushSubscription.upsert({
    where:  { endpoint },
    create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, userId: session.user.id, userAgent },
    update: { p256dh: keys.p256dh, auth: keys.auth, userId: session.user.id, userAgent },
  })

  return NextResponse.json({ subscribed: true })
}

// DELETE — unregister this device.
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { endpoint } = z.object({ endpoint: z.string().url() }).parse(await req.json())

  await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: session.user.id },
  })

  return NextResponse.json({ subscribed: false })
}
