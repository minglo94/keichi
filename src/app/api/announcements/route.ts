import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { notifyMany } from "@/lib/notify"
import { z } from "zod"

const createSchema = z.object({
  title:      z.string().min(1).max(200),
  body:       z.string().min(1).max(10000),
  committee:  z.enum(["ADMIN", "DISCIPLINE", "IT", "CURRICULUM", "ECA"]).optional(),
  target:     z.enum(["ALL", "ADMIN", "DISCIPLINE", "IT", "CURRICULUM", "ECA", "CLASS"]).default("ALL"),
  priority:   z.enum(["NORMAL", "IMPORTANT", "URGENT"]).default("NORMAL"),
  status:     z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).default("PUBLISHED"),
  categoryId: z.string().optional(),
  classId:    z.string().optional(),
  pinned:     z.boolean().default(false),
  publishAt:  z.string().optional().transform(v => v ? new Date(v) : undefined),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const target     = searchParams.get("target")
  const categoryId = searchParams.get("categoryId")
  const status     = searchParams.get("status")
  const date       = searchParams.get("date")   // YYYY-MM-DD (HKT day) — used by the PA dashboard

  let whereClause: any = {}

  if (session.user.role === "STUDENT") {
    // STUDENT：只看 ALL 或自己班、已發佈狀態、且到達發佈時間
    const studentEnrollments = await prisma.classEnrollment.findMany({
      where: { studentId: session.user.id },
      select: { classId: true }
    })
    const classIds = studentEnrollments.map(e => e.classId)

    whereClause = {
      status:    "PUBLISHED",
      publishAt: { lte: new Date() },
      OR: [
        { target: "ALL" },
        { target: "CLASS", classId: { in: classIds } }
      ]
    }
  } else {
    // TEACHER / ADMIN：看全部（可選 target / categoryId / status / date 過濾）
    if (target)     whereClause.target     = target
    if (categoryId) whereClause.categoryId = categoryId
    if (status)     whereClause.status     = status
    if (date) {
      // Interpret the date param as a Hong Kong (UTC+8) calendar day.
      const start = new Date(`${date}T00:00:00+08:00`)
      const end   = new Date(start.getTime() + 24 * 60 * 60 * 1000)
      whereClause.publishAt = { gte: start, lt: end }
    }
  }

  const announcements = await prisma.announcement.findMany({
    where: whereClause,
    include: {
      author:   { select: { id: true, name: true, image: true } },
      category: { select: { id: true, name: true, committee: true } },
    },
    orderBy: [
      { priority:  "desc" },
      { pinned:    "desc" },
      { publishAt: "desc" },
    ],
  })

  return NextResponse.json(announcements)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const { syncToGoogle, ...rest } = body
  const data = createSchema.parse(rest)

  const announcement = await prisma.announcement.create({
    data: { ...data, authorId: session.user.id },
    include: {
      author:   { select: { id: true, name: true, image: true } },
      category: { select: { id: true, name: true, committee: true } },
    },
  })

  // Notify recipients based on target (best-effort, non-blocking).
  try {
    let recipientIds: string[] = []
    if (data.target === "CLASS" && data.classId) {
      const enrolls = await prisma.classEnrollment.findMany({
        where: { classId: data.classId }, select: { studentId: true },
      })
      recipientIds = enrolls.map((e) => e.studentId)
    } else if (data.target === "ALL") {
      const staff = await prisma.user.findMany({
        where: { role: { in: ["TEACHER", "ADMIN"] } }, select: { id: true },
      })
      recipientIds = staff.map((u) => u.id)
    } else {
      // A committee target — notify that committee's members.
      const members = await prisma.committeeRole.findMany({
        where: { committee: data.target as "ADMIN" | "DISCIPLINE" | "IT" | "CURRICULUM" | "ECA" },
        select: { userId: true },
      })
      recipientIds = members.map((m) => m.userId)
    }
    recipientIds = recipientIds.filter((id) => id !== session.user.id)
    await notifyMany(recipientIds, {
      type:  "ANNOUNCEMENT",
      title: `新公告：${announcement.title}`,
      body:  announcement.body.slice(0, 120),
      link:  data.target === "CLASS" ? "/student" : "/teacher/announcements",
    })
  } catch (err) {
    console.error("announcement notify failed:", err)
  }

  // Google Calendar Sync Implementation
  if (syncToGoogle && (session as any).accessToken) {
    try {
      const googleRes = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${(session as any).accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          summary: announcement.title,
          description: announcement.body,
          start: {
            dateTime: new Date(announcement.createdAt).toISOString(),
          },
          end: {
            dateTime: new Date(announcement.createdAt.getTime() + 3600000).toISOString(), // 1 hour duration
          },
        }),
      })

      if (googleRes.ok) {
        const event = await googleRes.json()
        await prisma.announcement.update({
          where: { id: announcement.id },
          data: { googleEventId: event.id }
        })
      } else {
        const error = await googleRes.text()
        console.error("Google Calendar Sync failed:", error)
      }
    } catch (err) {
      console.error("Google Calendar Sync error:", err)
    }
  }

  return NextResponse.json(announcement, { status: 201 })
}
