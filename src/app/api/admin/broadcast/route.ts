import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { notifyMany } from "@/lib/notify"
import { z } from "zod"

// 推送訊息 — admin-only broadcast to staff.
//
// Sends an in-app notification (persisted in Notification + pushed live over
// Pusher to each recipient's private channel) via notifyMany(). Unlike
// announcements, nothing is stored as a public record — this is purely a
// message push, so use it for one-off notices rather than school announcements.

const COMMITTEES = ["ADMIN", "DISCIPLINE", "IT", "CURRICULUM", "ECA"] as const

// GET — staff list for the recipient picker (teachers + admins).
export async function GET() {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const staff = await prisma.user.findMany({
    where:  { role: { in: ["TEACHER", "ADMIN"] } },
    select: {
      id: true, name: true, email: true, image: true, role: true,
      committeeRoles: { select: { committee: true, isChair: true } },
    },
    orderBy: { name: "asc" },
  })

  return NextResponse.json({ staff })
}

const sendSchema = z.object({
  title:     z.string().min(1).max(200),
  body:      z.string().max(2000).optional(),
  link:      z.string().max(300).optional(),
  target:    z.enum(["ALL", "COMMITTEE", "USERS"]),
  committee: z.enum(COMMITTEES).optional(),
  userIds:   z.array(z.string()).optional(),
})

// POST — resolve the target to a recipient list and push to each.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { title, body, link, target, committee, userIds } = sendSchema.parse(await req.json())

  let recipientIds: string[] = []

  if (target === "ALL") {
    const staff = await prisma.user.findMany({
      where: { role: { in: ["TEACHER", "ADMIN"] } }, select: { id: true },
    })
    recipientIds = staff.map((u) => u.id)
  } else if (target === "COMMITTEE") {
    if (!committee) {
      return NextResponse.json({ error: "請選擇組別" }, { status: 400 })
    }
    const members = await prisma.committeeRole.findMany({
      where: { committee }, select: { userId: true },
    })
    recipientIds = members.map((m) => m.userId)
  } else {
    if (!userIds?.length) {
      return NextResponse.json({ error: "請選擇收件人" }, { status: 400 })
    }
    // Only ever send to real staff accounts, whatever ids were posted.
    const staff = await prisma.user.findMany({
      where:  { id: { in: userIds }, role: { in: ["TEACHER", "ADMIN"] } },
      select: { id: true },
    })
    recipientIds = staff.map((u) => u.id)
  }

  // Don't notify yourself, and de-duplicate.
  recipientIds = Array.from(new Set(recipientIds)).filter((id) => id !== session.user.id)

  if (recipientIds.length === 0) {
    return NextResponse.json({ error: "沒有符合的收件人" }, { status: 400 })
  }

  await notifyMany(recipientIds, { type: "GENERAL", title, body, link })

  return NextResponse.json({ sent: recipientIds.length })
}
