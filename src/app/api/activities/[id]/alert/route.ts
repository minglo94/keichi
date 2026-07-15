import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { pusherServer } from "@/lib/pusher"

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const activity = await prisma.activity.findUnique({
    where: { id: params.id },
    include: {
      assignments: {
        where:   { status: "PENDING" },
        include: { student: { select: { id: true } } },
      },
    },
  })
  if (!activity) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (activity.createdById !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const payload = {
    activityId: activity.id,
    title:      activity.title,
    startTime:  activity.startTime.toISOString(),
    location:   activity.location,
  }

  const now = new Date()
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

  return NextResponse.json({ alerted: activity.assignments.length })
}
