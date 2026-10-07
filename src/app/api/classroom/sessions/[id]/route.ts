import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isAdmin, isTeacherOrAdmin } from "@/lib/roles"
import { z } from "zod"

const schema = z.object({ ended: z.boolean() })

// PATCH — 完結課堂 (or reopen). Only the teacher who ran the lesson, or an admin.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "資料不完整" }, { status: 400 })

  const row = await prisma.classroomSession.findUnique({ where: { id: params.id }, select: { teacherId: true } })
  if (!row) return NextResponse.json({ error: "找不到課堂" }, { status: 404 })
  if (row.teacherId !== session.user.id && !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "只有上課老師可以完結此課堂" }, { status: 403 })
  }

  const updated = await prisma.classroomSession.update({
    where: { id: params.id },
    data:  { endedAt: parsed.data.ended ? new Date() : null },
  })
  return NextResponse.json(updated)
}
