import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isTeacherOrAdmin } from "@/lib/roles"
import { requireClassAccess } from "@/lib/class-perm"
import { canRecordHomework } from "@/lib/class-rep"
import { hkDayStart } from "@/lib/hk-date"
import { z } from "zod"

type Params = { params: { classId: string; hwId: string } }

/**
 * Who may change this homework: a teacher with access to the class, always;
 * the 課代表 who recorded it, only until a teacher has confirmed it in class.
 */
async function authorise(params: Params["params"], user: { id: string; role: Parameters<typeof isTeacherOrAdmin>[0] }) {
  const hw = await prisma.homework.findFirst({
    where: { id: params.hwId, classId: params.classId },
    select: { id: true, recordedBy: true, confirmedAt: true, subject: true },
  })
  if (!hw) return NextResponse.json({ error: "找不到功課" }, { status: 404 })
  if (isTeacherOrAdmin(user.role)) {
    const gate = await requireClassAccess(params.classId, { id: user.id, role: user.role })
    if (gate instanceof NextResponse) return gate
    return { hw, teacher: true }
  }
  if (hw.recordedBy !== user.id || hw.confirmedAt) {
    return NextResponse.json({ error: "只可以修改自己記錄、而老師未覆核的功課" }, { status: 403 })
  }
  if (!await canRecordHomework(params.classId, user.id, hw.subject)) {
    return NextResponse.json({ error: "你已不是此班的課代表" }, { status: 403 })
  }
  return { hw, teacher: false }
}

const YMD = /^\d{4}-\d{2}-\d{2}$/
const schema = z.object({
  title:     z.string().trim().min(1).max(120).optional(),
  detail:    z.string().trim().max(2000).nullable().optional(),
  dueDate:   z.string().regex(YMD).nullable().optional(),
  confirmed: z.boolean().optional(),   // teachers only: 已在課堂覆核
})

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await authorise(params, session.user)
  if (ok instanceof NextResponse) return ok

  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "資料不正確" }, { status: 400 })
  const d = parsed.data
  if (d.confirmed !== undefined && !ok.teacher) {
    return NextResponse.json({ error: "只有老師可以覆核" }, { status: 403 })
  }

  const updated = await prisma.homework.update({
    where: { id: ok.hw.id },
    data: {
      ...(d.title  !== undefined ? { title: d.title } : {}),
      ...(d.detail !== undefined ? { detail: d.detail || null } : {}),
      ...(d.dueDate !== undefined ? { dueDate: d.dueDate ? hkDayStart(d.dueDate) : null } : {}),
      ...(d.confirmed !== undefined
        ? { confirmedAt: d.confirmed ? new Date() : null, confirmedBy: d.confirmed ? session.user.id : null }
        : {}),
    },
  })
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const ok = await authorise(params, session.user)
  if (ok instanceof NextResponse) return ok
  // 欠交 records keep existing (their homework link is cleared): a deleted
  // assignment doesn't erase the fact that a student missed it.
  await prisma.homework.delete({ where: { id: ok.hw.id } })
  return new NextResponse(null, { status: 204 })
}
