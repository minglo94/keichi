import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { pusherServer } from "@/lib/pusher"
import { notify } from "@/lib/notify"
import { z } from "zod"

const schema = z.object({
  action:          z.enum(["approve", "reject"]),
  rejectionReason: z.string().optional(),
})

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "僅管理員可批核文件" }, { status: 403 })
  }

  const { action, rejectionReason } = schema.parse(await req.json())
  if (action === "reject" && !rejectionReason?.trim()) {
    return NextResponse.json({ error: "退回時必須填寫原因" }, { status: 400 })
  }

  const doc = await prisma.agentDocument.findUnique({ where: { id: params.id } })
  if (!doc)                              return NextResponse.json({ error: "找不到文件" }, { status: 404 })
  if (doc.approvalStatus !== "PENDING") return NextResponse.json({ error: "此文件並非待批核狀態" }, { status: 409 })

  const newStatus = action === "approve" ? "APPROVED" : "REJECTED"

  await prisma.agentDocument.update({
    where: { id: params.id },
    data: {
      approvalStatus:  newStatus,
      approvedBy:      session.user.id,
      approvedAt:      new Date(),
      rejectionReason: action === "reject" ? rejectionReason : null,
    },
  })

  await prisma.agentTask.update({
    where: { id: doc.taskId },
    data:  { status: action === "approve" ? "DONE" : "FAILED" },
  }).catch(() => {})

  await prisma.agentAuditLog.create({
    data: { userId: session.user.id, action: action === "approve" ? "APPROVE" : "REJECT", engine: "system", docType: doc.docType },
  }).catch(() => {})

  try {
    await pusherServer.trigger(`private-user-${doc.userId}`, "doc-approval", {
      documentId:      params.id,
      title:           doc.title,
      status:          newStatus,
      rejectionReason: rejectionReason ?? null,
      message: action === "approve"
        ? `✓「${doc.title}」已批核`
        : `✗「${doc.title}」被退回：${rejectionReason}`,
    })
  } catch {}

  // Persist an in-app notification for the document owner.
  await notify({
    userId: doc.userId,
    type:   "DOC_APPROVAL",
    title:  action === "approve" ? `文件已批核：${doc.title}` : `文件被退回：${doc.title}`,
    body:   action === "reject" ? `退回原因：${rejectionReason}` : undefined,
    link:   `/teacher/agents/documents/${params.id}`,
  })

  return NextResponse.json({ ok: true, id: params.id, status: newStatus })
}
