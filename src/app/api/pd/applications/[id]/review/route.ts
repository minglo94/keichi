import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { pdSession } from "@/lib/pd-auth"
import { notify } from "@/lib/notify"
import { checkPdClashes, datesInRange, summariseChecks, hasBlocking } from "@/lib/pd-clash"
import { z } from "zod"
import { hkYmd } from "@/lib/hk-date"

// Mirrors the notice/activity review routes: PENDING-only, reject needs a
// reason. Approving over a clash is allowed but must be acknowledged, and the
// fact is recorded on the row.
const schema = z.object({
  action:           z.enum(["approve", "reject"]),
  rejectionReason:  z.string().max(1000).optional(),
  acknowledgeClash: z.boolean().optional(),
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await pdSession()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const app = await prisma.pdApplication.findUnique({ where: { id: params.id } })
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (app.status !== "PENDING") {
    return NextResponse.json({ error: "此申請並非待批核狀態" }, { status: 409 })
  }

  const { action, rejectionReason, acknowledgeClash } = schema.parse(await req.json())

  if (action === "reject") {
    if (!rejectionReason?.trim()) {
      return NextResponse.json({ error: "請填寫退回原因" }, { status: 400 })
    }
    const updated = await prisma.pdApplication.update({
      where: { id: params.id },
      data: {
        status: "REJECTED", rejectionReason: rejectionReason.trim(),
        reviewedById: session.user.id, reviewedAt: new Date(),
      },
    })
    await notify({
      userId: app.teacherId, type: "DOC_APPROVAL",
      title:  `進修申請被退回：${app.title}`,
      body:   rejectionReason.trim(),
      link:   "/teacher/committee/admin/pd",
    })
    return NextResponse.json(updated)
  }

  // Re-run the check at decision time rather than trusting the stored summary —
  // the timetable or holiday list may have changed since it was filed.
  // The dates are stored as HK midnight, which is 16:00 the *previous* day in
  // UTC — so slicing the ISO string re-checked the wrong day. Read them back in
  // Hong Kong.
  const dates = datesInRange(hkYmd(app.startDate), hkYmd(app.endDate))
  // Resolve against the live account so a later 時間表姓名 correction takes
  // effect; fall back to the name snapshotted on the application.
  const teacherAccount = await prisma.user.findUnique({
    where:  { id: app.teacherId },
    select: { name: true, nameEn: true, timetableName: true },
  })
  const checks   = await checkPdClashes({
    teacher: teacherAccount ?? { name: app.teacherName, nameEn: null, timetableName: null },
    dates, startTime: app.startTime, endTime: app.endTime,
  })
  const blocking = hasBlocking(checks)

  if (blocking && !acknowledgeClash) {
    return NextResponse.json(
      { error: "此申請有衝突或未能確認，請確認後再批核", checks, needsAcknowledge: true },
      { status: 409 },
    )
  }

  const updated = await prisma.pdApplication.update({
    where: { id: params.id },
    data: {
      status: "APPROVED", rejectionReason: null,
      reviewedById: session.user.id, reviewedAt: new Date(),
      clashSummary: summariseChecks(checks),
      approvedWithClash: blocking,
    },
  })

  await notify({
    userId: app.teacherId, type: "DOC_APPROVAL",
    title:  `進修申請已批核：${app.title}`,
    body:   `${app.startTime}–${app.endTime}${blocking ? "（已知有衝突，請自行安排代課）" : ""}`,
    link:   "/teacher/committee/admin/pd",
  })

  return NextResponse.json({ ...updated, approvedWithClash: blocking })
}
