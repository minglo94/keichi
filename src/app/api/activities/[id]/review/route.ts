import { managedResourceResponse } from "@/lib/after-school/managed"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin, isAdmin, canEditCommittee } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { notify } from "@/lib/notify"
import { z } from "zod"
import { publishActivityToCalendar } from "@/lib/activity-calendar"

// Chair sign-off for directly-created activities.
//
// Mirrors the notice review route: the committee's chair or any admin decides,
// rejection needs a reason, and a non-PENDING row returns 409. Activities with
// no committee fall back to admin-only, since there is no chair to ask.

const schema = z.object({
  action:          z.enum(["approve", "reject"]),
  rejectionReason: z.string().max(1000).optional(),
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const managed = await managedResourceResponse("activity", params.id)
  if (managed) return managed

  const activity = await prisma.activity.findUnique({ where: { id: params.id } })
  if (!activity) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const allowed = activity.committee
    ? await canEditCommittee(session.user.id, session.user.role, activity.committee)
    : isAdmin(session.user.role)
  if (!allowed) {
    return NextResponse.json({ error: "只有該組別主席或管理員可批核" }, { status: 403 })
  }
  if (activity.approval !== "PENDING") {
    return NextResponse.json({ error: "此活動並非待批核狀態" }, { status: 409 })
  }

  const { action, rejectionReason } = schema.parse(await req.json())

  if (action === "reject" && !rejectionReason?.trim()) {
    return NextResponse.json({ error: "請填寫退回原因" }, { status: 400 })
  }

  const updated = await prisma.activity.update({
    where: { id: params.id },
    data: {
      approval:        action === "approve" ? "APPROVED" : "REJECTED",
      approvedById:    session.user.id,
      approvedAt:      new Date(),
      rejectionReason: action === "reject" ? rejectionReason!.trim() : null,
    },
  })

  // Approved == on the school calendar, the same rule the notice path follows.
  // Idempotent, so re-approving cannot create a second entry.
  let calendarEventId: string | null = null
  if (action === "approve") {
    calendarEventId = await publishActivityToCalendar(updated)
  }

  const when = activity.startTime.toLocaleString("zh-HK", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  })
  await notify({
    userId: activity.createdById,
    type:   "DOC_APPROVAL",
    title:  action === "approve" ? `活動已批核：${activity.title}` : `活動被退回：${activity.title}`,
    body:   action === "approve"
      ? `${when}　學生現在可以看到此活動${calendarEventId ? "，並已加入行事曆" : ""}`
      : rejectionReason!.trim(),
    link:   `/teacher/activities/${activity.id}`,
  })

  return NextResponse.json(updated)
}
