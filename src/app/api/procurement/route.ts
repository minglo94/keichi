import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin, isTeacherOrAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { notifyMany } from "@/lib/notify"
import { z } from "zod"

const itemSchema = z.object({
  name:      z.string().min(1).max(200),
  spec:      z.string().max(200).optional().default(""),
  qty:       z.number().int().min(1).max(100000),
  unitPrice: z.number().min(0).max(10_000_000),
})

const createSchema = z.object({
  department: z.string().min(1).max(100),
  items:      z.array(itemSchema).min(1).max(50),
  reason:     z.string().min(1).max(2000),
  supplier:   z.string().max(200).optional(),
})

// GET — own requests; admins see all. Optional ?status=
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const status = new URL(req.url).searchParams.get("status") || undefined
  const admin  = isAdmin(session.user.role)

  const requests = await prisma.procurementRequest.findMany({
    where: {
      ...(admin ? {} : { requesterId: session.user.id }),
      ...(status ? { status: status as "PENDING" | "APPROVED" | "REJECTED" | "ORDERED" } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { requester: { select: { id: true, name: true, email: true } } },
    take: 200,
  })

  return NextResponse.json(requests)
}

// POST — submit a procurement request (any staff)
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const data = createSchema.parse(await req.json())
  const totalBudget = Math.round(
    data.items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0)
  )

  const request = await prisma.procurementRequest.create({
    data: {
      requesterId: session.user.id,
      department:  data.department,
      items:       data.items,
      totalBudget,
      reason:      data.reason,
      supplier:    data.supplier,
    },
    include: { requester: { select: { id: true, name: true, email: true } } },
  })

  // Notify admins that a request awaits review.
  try {
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } })
    await notifyMany(
      admins.map((a) => a.id).filter((id) => id !== session.user.id),
      {
        type:  "GENERAL",
        title: `新採購申請：${data.department}`,
        body:  `預算 HKD ${totalBudget.toLocaleString()} · 申請人 ${request.requester.name ?? request.requester.email}`,
        link:  "/teacher/committee/admin/procurement",
      }
    )
  } catch {}

  return NextResponse.json(request, { status: 201 })
}
