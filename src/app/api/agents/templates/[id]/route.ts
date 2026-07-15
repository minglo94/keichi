import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const patchSchema = z.object({
  docType:   z.string().min(1).max(50).optional(),
  name:      z.string().min(1).max(100).optional(),
  content:   z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "僅管理員可管理範本" }, { status: 403 })
  }

  const data = patchSchema.parse(await req.json())

  if (data.isDefault) {
    const existing = await prisma.agentTemplate.findUnique({ where: { id: params.id } })
    if (existing) {
      await prisma.agentTemplate.updateMany({
        where: { docType: data.docType ?? existing.docType, isDefault: true, id: { not: params.id } },
        data:  { isDefault: false },
      })
    }
  }

  const updated = await prisma.agentTemplate.update({ where: { id: params.id }, data })
  return NextResponse.json(updated)
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "僅管理員可管理範本" }, { status: 403 })
  }

  await prisma.agentTemplate.delete({ where: { id: params.id } })
  return NextResponse.json({ ok: true })
}
