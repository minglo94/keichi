import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isTeacherOrAdmin } from "@/lib/roles"
import { requireClassAccess } from "@/lib/class-perm"
import { z } from "zod"

type Params = { params: { id: string } }

async function load(id: string) {
  return prisma.lessonRecord.findUnique({
    where: { id }, select: { id: true, classId: true, kind: true, awardedAt: true },
  })
}

const schema = z.object({
  note:     z.string().trim().max(300).nullable().optional(),
  tag:      z.string().trim().max(30).nullable().optional(),
  points:   z.number().int().min(-5).max(5).optional(),
  resolved: z.boolean().optional(),
})

// PATCH — edit a note, mark 已跟進, or change a pending performance score.
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const rec = await load(params.id)
  if (!rec) return NextResponse.json({ error: "找不到紀錄" }, { status: 404 })
  const gate = await requireClassAccess(rec.classId, session.user)
  if (gate instanceof NextResponse) return gate

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "資料不正確" }, { status: 400 })
  const d = parsed.data

  // Changing what was already paid out would make the student's 積點記錄 lie.
  if (d.points !== undefined && rec.awardedAt) {
    return NextResponse.json({ error: "積點已發放，請先撤回再修改" }, { status: 409 })
  }
  if (d.points !== undefined && rec.kind !== "PERFORMANCE") {
    return NextResponse.json({ error: "只有課堂表現有分數" }, { status: 400 })
  }

  const updated = await prisma.lessonRecord.update({
    where: { id: rec.id },
    data: {
      ...(d.note !== undefined ? { note: d.note || null } : {}),
      ...(d.tag  !== undefined ? { tag:  d.tag  || null } : {}),
      ...(d.points !== undefined ? { points: d.points } : {}),
      ...(d.resolved !== undefined ? { resolved: d.resolved, resolvedAt: d.resolved ? new Date() : null } : {}),
    },
  })
  return NextResponse.json(updated)
}

// DELETE — remove a mistaken record. A paid-out performance row must be
// withdrawn first, so points and records never disagree.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const rec = await load(params.id)
  if (!rec) return NextResponse.json({ error: "找不到紀錄" }, { status: 404 })
  const gate = await requireClassAccess(rec.classId, session.user)
  if (gate instanceof NextResponse) return gate

  if (rec.awardedAt) {
    return NextResponse.json({ error: "積點已發放，請先撤回再刪除" }, { status: 409 })
  }
  await prisma.lessonRecord.delete({ where: { id: rec.id } })
  return new NextResponse(null, { status: 204 })
}
