import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isTeacherOrAdmin } from "@/lib/roles"
import { requireClassAccess } from "@/lib/class-perm"
import { hkDayStart, hkYmd } from "@/lib/hk-date"
import { dbErrorMessage } from "@/lib/db-error"
import { z } from "zod"

// A ClassroomSession is "this lesson, actually taught". Opening a class's
// 課堂 gets-or-creates today's session for that period, so records taken during
// the lesson (Phase 2) all land on one row — even if the teacher navigates
// away and back.

const schema = z.object({
  classId:     z.string().min(1),
  period:      z.number().int().min(0).max(10).default(0),
  periodLabel: z.string().max(20).nullable().optional(),
  subject:     z.string().max(50).nullable().optional(),
  source:      z.enum(["timetable", "manual"]).default("manual"),
  /** Force a second session for the same period (a double / cover lesson). */
  fresh:       z.boolean().optional(),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "資料不完整" }, { status: 400 })
  const d = parsed.data

  const gate = await requireClassAccess(d.classId, session.user)
  if (gate instanceof NextResponse) return gate

  try {
    const date = hkDayStart(hkYmd())

    if (!d.fresh) {
      // Reuse this teacher's open session for the same slot today.
      const existing = await prisma.classroomSession.findFirst({
        where:   { classId: d.classId, date, period: d.period, teacherId: session.user.id, endedAt: null },
        orderBy: { seq: "desc" },
      })
      if (existing) {
        // Resuming: fill in lesson details this open knows and the stored
        // session doesn't (it may have been started from the class list).
        const fill = {
          ...(!existing.periodLabel && d.periodLabel ? { periodLabel: d.periodLabel } : {}),
          ...(!existing.subject && d.subject ? { subject: d.subject } : {}),
        }
        return NextResponse.json(Object.keys(fill).length
          ? await prisma.classroomSession.update({ where: { id: existing.id }, data: fill })
          : existing)
      }
    }

    // seq = how many times this class has been opened in this slot today, +1.
    // A concurrent open can race to the same seq; the unique key rejects one and
    // we retry once with a fresh count.
    for (let attempt = 0; attempt < 2; attempt++) {
      const seq = (await prisma.classroomSession.count({ where: { classId: d.classId, date, period: d.period } })) + 1
      try {
        const created = await prisma.classroomSession.create({
          data: {
            classId: d.classId, teacherId: session.user.id, date, period: d.period,
            periodLabel: d.periodLabel ?? null, subject: d.subject ?? null,
            source: d.source, seq,
          },
        })
        return NextResponse.json(created, { status: 201 })
      } catch (err) {
        if ((err as { code?: string }).code !== "P2002" || attempt === 1) throw err
      }
    }
    return NextResponse.json({ error: "未能建立課堂" }, { status: 500 })
  } catch (err) {
    const msg = dbErrorMessage(err)
    console.error("[classroom/sessions]", err)
    return NextResponse.json({ error: msg ?? "未能建立課堂" }, { status: msg ? 503 : 500 })
  }
}

// GET — this teacher's sessions today, newest first.
export async function GET() {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  try {
    const sessions = await prisma.classroomSession.findMany({
      where:   { teacherId: session.user.id, date: hkDayStart(hkYmd()) },
      include: { class: { select: { id: true, name: true } } },
      orderBy: { startedAt: "desc" },
    })
    return NextResponse.json(sessions)
  } catch (err) {
    const msg = dbErrorMessage(err)
    return NextResponse.json({ error: msg ?? "未能載入" }, { status: msg ? 503 : 500 })
  }
}
