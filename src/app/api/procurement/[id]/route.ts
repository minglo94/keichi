import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { notify } from "@/lib/notify"
import { z } from "zod"

const patchSchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "ORDERED"]),
  note:   z.string().max(500).optional(),
})

// PATCH — admin updates status (approve / reject / mark ordered)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "僅管理員可審批採購申請" }, { status: 403 })
  }

  const existing = await prisma.procurementRequest.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: "找不到申請" }, { status: 404 })

  const { status, note } = patchSchema.parse(await req.json())

  const updated = await prisma.procurementRequest.update({
    where: { id: params.id },
    data: {
      status,
      note:       note ?? existing.note,
      reviewedBy: session.user.id,
      reviewedAt: new Date(),
    },
    include: { requester: { select: { id: true, name: true, email: true } } },
  })

  // Notify the requester of the decision.
  const label = status === "APPROVED" ? "已批准" : status === "REJECTED" ? "已拒絕" : status === "ORDERED" ? "已訂購" : "已更新"
  await notify({
    userId: updated.requesterId,
    type:   "GENERAL",
    title:  `採購申請${label}：${updated.department}`,
    body:   note || undefined,
    link:   "/teacher/committee/admin/procurement",
  })

  return NextResponse.json(updated)
}

// DELETE — requester (if still pending) or admin may remove
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const existing = await prisma.procurementRequest.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: "找不到申請" }, { status: 404 })

  const owner = existing.requesterId === session.user.id && existing.status === "PENDING"
  if (!owner && !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.procurementRequest.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
