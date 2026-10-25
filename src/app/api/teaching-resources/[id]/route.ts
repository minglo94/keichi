import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin, isAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { RESOURCE_CATEGORIES } from "@/lib/resource"
import type { Role } from "@prisma/client"
import { z } from "zod"

const SELECT = {
  id: true, title: true, url: true, description: true,
  category: true, tags: true, createdById: true, createdAt: true,
  createdBy: { select: { id: true, name: true } },
} as const

// Seeded/imported rows have createdById = null, which never matches a real
// session id — so those are admin-only by construction.
function canManage(createdById: string | null, userId: string, role: Role | undefined) {
  return createdById === userId || isAdmin(role)
}

const patchSchema = z.object({
  title:       z.string().min(1).max(200).optional(),
  url:         z.string().url().max(2000).optional(),
  description: z.string().max(1000).nullable().optional(),
  category:    z.enum(RESOURCE_CATEGORIES).optional(),
  tags:        z.array(z.string().max(30)).max(20).optional(),
})

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const existing = await prisma.teachingResource.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!canManage(existing.createdById, session.user.id, session.user.role)) {
    return NextResponse.json({ error: "只有分享者或管理員可編輯" }, { status: 403 })
  }

  const data = patchSchema.parse(await req.json())
  if (data.url && !/^https?:\/\//i.test(data.url)) {
    return NextResponse.json({ error: "連結必須以 http:// 或 https:// 開頭" }, { status: 400 })
  }

  const updated = await prisma.teachingResource.update({
    where: { id: params.id }, data, select: SELECT,
  })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const existing = await prisma.teachingResource.findUnique({ where: { id: params.id } })
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!canManage(existing.createdById, session.user.id, session.user.role)) {
    return NextResponse.json({ error: "只有分享者或管理員可刪除" }, { status: 403 })
  }

  await prisma.teachingResource.delete({ where: { id: params.id } })
  return NextResponse.json({ deleted: true })
}
