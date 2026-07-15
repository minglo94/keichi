import { isTeacherOrAdmin, isAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { classKey } from "@/lib/discipline"
import type { Role } from "@prisma/client"
import { z } from "zod"

const TYPES = ["MERIT", "MISCONDUCT", "DEMERIT", "MINOR_FAULT", "MAJOR_FAULT", "LATE", "ABSENT"] as const

const patchSchema = z.object({
  date:        z.string().optional(),
  className:   z.string().min(1).max(50).optional(),
  studentName: z.string().min(1).max(100).optional(),
  type:        z.enum(TYPES).optional(),
  description: z.string().optional(),
  action:      z.string().optional(),
  resolved:    z.boolean().optional(),
})

// The author, a discipline committee member, or an admin may edit/delete.
async function canManage(userId: string, role: Role | undefined, authorId: string): Promise<boolean> {
  if (authorId === userId || isAdmin(role)) return true
  const r = await prisma.committeeRole.findFirst({ where: { userId, committee: "DISCIPLINE" } })
  return !!r
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const record = await prisma.behaviorRecord.findUnique({ where: { id: params.id } })
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!(await canManage(session.user.id, session.user.role, record.authorId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const data = patchSchema.parse(await req.json())
  const updated = await prisma.behaviorRecord.update({
    where: { id: params.id },
    data: {
      ...data,
      ...(data.date ? { date: new Date(data.date) } : {}),
      ...(data.className ? { classKey: classKey(data.className) } : {}),
    },
    include: { author: { select: { id: true, name: true } } },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const record = await prisma.behaviorRecord.findUnique({ where: { id: params.id } })
  if (!record) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!(await canManage(session.user.id, session.user.role, record.authorId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await prisma.behaviorRecord.delete({ where: { id: params.id } })
  return NextResponse.json({ deleted: true })
}
