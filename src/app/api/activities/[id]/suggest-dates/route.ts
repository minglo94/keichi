import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin, isAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { suggestActivityDates } from "@/lib/activity-suggest"
import type { ActivityType } from "@prisma/client"

// GET — suggest alternative dates for an activity so the assigned students
// don't clash and the weekday matches the school rule (課外 → Mon/Tue,
// 學科 → Wed–Fri). Optional ?type=ECA|ACADEMIC overrides a not-yet-set type.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const activity = await prisma.activity.findUnique({
    where:   { id: params.id },
    include: { assignments: { select: { studentId: true } } },
  })
  if (!activity) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (activity.createdById !== session.user.id && !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const override = new URL(req.url).searchParams.get("type")
  const activityType: ActivityType | null =
    (override === "ECA" || override === "ACADEMIC") ? override : activity.activityType

  if (!activityType) {
    return NextResponse.json({ error: "NO_TYPE", message: "請先設定活動類型（課外活動 / 學科活動）。" }, { status: 400 })
  }

  const result = await suggestActivityDates({
    activityType,
    startTime:         activity.startTime,
    endTime:           activity.endTime,
    studentIds:        activity.assignments.map((a) => a.studentId),
    excludeActivityId: activity.id,
  })

  return NextResponse.json(result)
}
