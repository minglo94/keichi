import { isTeacherOrAdmin, isAdmin, canEditCommittee } from "@/lib/roles"
import { canManageActivity } from "@/lib/activity-perm"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { unpublishActivityCalendar } from "@/lib/activity-calendar"

const patchSchema = z.object({
  title:       z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  startTime:   z.string().datetime().optional(),
  endTime:     z.string().datetime().nullable().optional(),
  location:    z.string().max(200).optional(),
  committee:   z.enum(["ADMIN", "DISCIPLINE", "IT", "CURRICULUM", "ECA", "STUDENT_SUPPORT"]).nullable().optional(),
  activityType: z.enum(["ECA", "ACADEMIC"]).nullable().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const activity = await prisma.activity.findUnique({
    where: { id: params.id },
    include: {
      createdBy:   { select: { id: true, name: true } },
      assignments: {
        include: { student: { select: { id: true, name: true, email: true, image: true } } },
        orderBy:  { createdAt: "asc" },
      },
    },
  })
  if (!activity) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Students only see their own assignment
  if (session.user.role === "STUDENT") {
    const mine = activity.assignments.filter((a) => a.studentId === session.user.id)
    return NextResponse.json({ ...activity, assignments: mine })
  }

  return NextResponse.json(activity)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const activity = await prisma.activity.findUnique({ where: { id: params.id } })
  if (!activity) return NextResponse.json({ error: "Not found" }, { status: 404 })
  // Same set as DELETE and the approval routes.
  if (!await canManageActivity(activity, session.user)) {
    return NextResponse.json({ error: "只有建立者、組別主席或管理員可修改" }, { status: 403 })
  }

  const data = patchSchema.parse(await req.json())
  const updated = await prisma.activity.update({
    where: { id: params.id },
    data: {
      ...data,
      startTime: data.startTime ? new Date(data.startTime) : undefined,
      endTime:   data.endTime !== undefined
        ? (data.endTime === null ? null : new Date(data.endTime))
        : undefined,
    },
    include: { _count: { select: { assignments: true } } },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const activity = await prisma.activity.findUnique({ where: { id: params.id } })
  if (!activity) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Creator, the committee's chair, or any admin — matching who may approve it.
  // Creator-only meant an admin couldn't remove a colleague's stray activity.
  const allowed =
    activity.createdById === session.user.id ||
    isAdmin(session.user.role) ||
    (activity.committee
      ? await canEditCommittee(session.user.id, session.user.role, activity.committee)
      : false)
  if (!allowed) return NextResponse.json({ error: "只有建立者、組別主席或管理員可刪除" }, { status: 403 })

  // ActivityAssignment cascades, so the attendance list goes with it.
  await prisma.activity.delete({ where: { id: params.id } })

  // Take the published calendar entry (and its Google copies) with it —
  // otherwise the activity vanishes but the event lingers on everyone's
  // calendar. Best-effort; the activity is already gone.
  await unpublishActivityCalendar(activity.calendarEventId)

  return NextResponse.json({ deleted: true })
}
