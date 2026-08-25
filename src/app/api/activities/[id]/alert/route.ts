import { isTeacherOrAdmin, isAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { pusherServer } from "@/lib/pusher"
import { notifyMany } from "@/lib/notify"

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const activity = await prisma.activity.findUnique({
    where: { id: params.id },
    include: {
      assignments: {
        // Everyone still expected to take part. Previously this was
        // PENDING-only, which meant a reminder reached NOBODY in the normal
        // case — students are assigned as CONFIRMED unless their timetable
        // clashes. ATTENDED/ABSENT are historical, so they are excluded.
        where:   { status: { in: ["PENDING", "CONFIRMED"] } },
        include: { student: { select: { id: true } } },
      },
    },
  })
  if (!activity) return NextResponse.json({ error: "Not found" }, { status: 404 })
  // The activity's owner, or any admin, may send reminders.
  if (activity.createdById !== session.user.id && !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (activity.assignments.length === 0) {
    return NextResponse.json({ error: "沒有可提醒的學生（名單為空或全部已出席／缺席）" }, { status: 400 })
  }

  const payload = {
    activityId: activity.id,
    title:      activity.title,
    startTime:  activity.startTime.toISOString(),
    location:   activity.location,
  }

  const now = new Date()
  const studentIds = activity.assignments.map((a) => a.student.id)

  // Transient toast for anyone with the page open right now.
  const alertPromises = activity.assignments.map(async (a) => {
    await pusherServer.trigger(
      `private-user-${a.student.id}`,
      "activity-alert",
      payload
    )
    await prisma.activityAssignment.update({
      where: { activityId_studentId: { activityId: params.id, studentId: a.student.id } },
      data:  { alertSent: true, alertedAt: now },
    })
  })

  await Promise.all(alertPromises)

  // Durable notification: shows in the student's bell, survives a reload, and
  // reaches installed devices via Web Push. Without this a reminder was lost
  // entirely unless the student happened to have the app open at that moment.
  const when = activity.startTime.toLocaleString("zh-HK", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  })
  await notifyMany(studentIds, {
    type:  "GENERAL",
    title: `活動提醒：${activity.title}`,
    body:  activity.location ? `${when} · ${activity.location}` : when,
    link:  "/student/activities",
  })

  return NextResponse.json({ alerted: activity.assignments.length })
}
