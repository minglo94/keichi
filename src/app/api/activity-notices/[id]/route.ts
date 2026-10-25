import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin, isAdmin, canEditCommittee } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { NOTICE_COMMITTEES } from "@/lib/notice"
import { z } from "zod"

const FULL_SELECT = {
  id: true, title: true, committee: true, status: true, payload: true,
  rejectionReason: true, calendarSynced: true, createdById: true,
  createdAt: true, updatedAt: true, reviewedAt: true,
  createdBy:  { select: { id: true, name: true } },
  reviewedBy: { select: { id: true, name: true } },
} as const

// GET — the author, the committee's chair, or an admin may open a notice.
export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const notice = await prisma.activityNotice.findUnique({ where: { id: params.id }, select: FULL_SELECT })
  if (!notice) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const allowed =
    notice.createdById === session.user.id ||
    isAdmin(session.user.role) ||
    (await canEditCommittee(session.user.id, session.user.role, notice.committee))
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  return NextResponse.json(notice)
}

const patchSchema = z.object({
  committee: z.enum(NOTICE_COMMITTEES as [string, ...string[]]).optional(),
  payload:   z.record(z.unknown()).optional(),
})

// PATCH — only the author, and only while still editable. An APPROVED notice is
// frozen: its calendar events are already out, so silently changing it would
// leave the two out of step.
export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const notice = await prisma.activityNotice.findUnique({ where: { id: params.id } })
  if (!notice) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (notice.createdById !== session.user.id) {
    return NextResponse.json({ error: "只有建立者可編輯此通告" }, { status: 403 })
  }
  if (notice.status === "PENDING") {
    return NextResponse.json({ error: "通告正在審批中，請先撤回或等待結果" }, { status: 409 })
  }
  if (notice.status === "APPROVED") {
    return NextResponse.json({ error: "通告已批核，不可再修改" }, { status: 409 })
  }

  const { committee, payload } = patchSchema.parse(await req.json())
  const title = payload
    ? String((payload as { activityName?: unknown }).activityName ?? "").trim()
    : undefined
  if (payload && !title) return NextResponse.json({ error: "請先填寫活動名稱" }, { status: 400 })

  const updated = await prisma.activityNotice.update({
    where: { id: params.id },
    data: {
      ...(committee ? { committee: committee as never } : {}),
      ...(payload   ? { payload: payload as never, title } : {}),
    },
    select: FULL_SELECT,
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const notice = await prisma.activityNotice.findUnique({ where: { id: params.id } })
  if (!notice) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (notice.createdById !== session.user.id && !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.activityNotice.delete({ where: { id: params.id } })
  return NextResponse.json({ deleted: true })
}
