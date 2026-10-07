import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isTeacherOrAdmin } from "@/lib/roles"
import { requireClassAccess } from "@/lib/class-perm"
import { loadRoster } from "@/lib/classroom-roster"
import { emptyLayout, parseLayout, reconcile, type SeatingLayout } from "@/lib/seating"
import { isFormClassName } from "@/lib/form-class"
import { dbErrorMessage } from "@/lib/db-error"

type Params = { params: { classId: string } }

// GET — the class, its roster, and its seating layout, with anyone no longer
// on the roster cleared out of their seat (reconcile). Everything the 課堂
// desktop needs to render, in one call.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const gate = await requireClassAccess(params.classId, session.user)
  if (gate instanceof NextResponse) return gate

  try {
    const [roster, plan] = await Promise.all([
      loadRoster(gate.cls.id, gate.cls.name),
      prisma.seatingPlan.findFirst({
        where:   { classId: gate.cls.id, isDefault: true },
        orderBy: { updatedAt: "desc" },
      }),
    ])
    const stored = plan ? parseLayout(plan.layout) : emptyLayout()
    const { layout, dropped } = reconcile(stored, new Set(roster.map((r) => r.id)))

    return NextResponse.json({
      cls:     { id: gate.cls.id, name: gate.cls.name, isForm: isFormClassName(gate.cls.name) },
      via:     gate.via,
      roster,
      layout,
      planId:  plan?.id ?? null,
      updatedAt: plan?.updatedAt ?? null,
      // Students removed from the class since the chart was last saved — their
      // seats are now empty. Reported so the change isn't silent.
      dropped: dropped.length,
    })
  } catch (err) {
    const msg = dbErrorMessage(err)
    console.error("[seating GET]", err)
    return NextResponse.json({ error: msg ?? "未能載入座位表" }, { status: msg ? 503 : 500 })
  }
}

// PUT — replace the default layout. Seating is always written whole: a chart
// is edited in bursts and saved as one arrangement.
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const gate = await requireClassAccess(params.classId, session.user)
  if (gate instanceof NextResponse) return gate

  const body = await req.json().catch(() => null) as { layout?: unknown } | null
  if (!body?.layout) return NextResponse.json({ error: "缺少座位表" }, { status: 400 })

  try {
    // parseLayout() is the validator: whatever the client sent, what we store
    // is a well-formed layout of a bounded size. Then strip students who aren't
    // on this class's roster, so a crafted request can't seat outsiders.
    const roster = await loadRoster(gate.cls.id, gate.cls.name)
    const { layout } = reconcile(parseLayout(body.layout), new Set(roster.map((r) => r.id)))
    const json = layout as unknown as Prisma.InputJsonValue

    const existing = await prisma.seatingPlan.findFirst({
      where: { classId: gate.cls.id, isDefault: true }, orderBy: { updatedAt: "desc" }, select: { id: true },
    })
    const saved = existing
      ? await prisma.seatingPlan.update({
          where: { id: existing.id }, data: { layout: json, updatedBy: session.user.id },
        })
      : await prisma.seatingPlan.create({
          data: { classId: gate.cls.id, layout: json, updatedBy: session.user.id },
        })

    return NextResponse.json({ planId: saved.id, updatedAt: saved.updatedAt, layout: layout satisfies SeatingLayout })
  } catch (err) {
    const msg = dbErrorMessage(err)
    console.error("[seating PUT]", err)
    return NextResponse.json({ error: msg ?? "儲存失敗" }, { status: msg ? 503 : 500 })
  }
}
