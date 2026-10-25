import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { notifyMany } from "@/lib/notify"

// POST — send a notice for sign-off: DRAFT|REJECTED → PENDING.
export async function POST(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const notice = await prisma.activityNotice.findUnique({ where: { id: params.id } })
  if (!notice) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (notice.createdById !== session.user.id) {
    return NextResponse.json({ error: "只有建立者可提交此通告" }, { status: 403 })
  }
  if (notice.status !== "DRAFT" && notice.status !== "REJECTED") {
    return NextResponse.json({ error: "此通告並非草稿狀態" }, { status: 409 })
  }

  const updated = await prisma.activityNotice.update({
    where: { id: params.id },
    // Clear the old rejection reason so a resubmission starts clean.
    data:  { status: "PENDING", rejectionReason: null },
  })

  // Tell the people who can actually act on it: that committee's chairs, plus
  // all admins. Without this an approver only finds out by opening the tab.
  const [chairs, admins] = await Promise.all([
    prisma.committeeRole.findMany({
      where:  { committee: notice.committee, isChair: true },
      select: { userId: true },
    }),
    prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } }),
  ])
  const recipients = Array.from(new Set([
    ...chairs.map((c) => c.userId),
    ...admins.map((a) => a.id),
  ])).filter((id) => id !== session.user.id)

  await notifyMany(recipients, {
    type:  "DOC_APPROVAL",
    title: `待批核通告：${notice.title}`,
    body:  `由 ${session.user.name ?? "老師"} 提交`,
    link:  `/teacher/committee/admin/activity-docs?tab=review&id=${notice.id}`,
  })

  return NextResponse.json(updated)
}
