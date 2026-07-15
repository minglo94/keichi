import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isTeacherOrAdmin, canEditCommittee } from "@/lib/roles"
import { z } from "zod"

const bodySchema = z.object({
  committee: z.enum(["ADMIN", "DISCIPLINE", "IT", "CURRICULUM", "ECA"]),
  toolKey:   z.string().min(1).max(200),
})

// POST — hide a preset tool from a committee page
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { committee, toolKey } = bodySchema.parse(await req.json())

  if (!(await canEditCommittee(session.user.id, session.user.role, committee))) {
    return NextResponse.json({ error: "管理員或組長專屬功能" }, { status: 403 })
  }

  await prisma.committeeHiddenTool.upsert({
    where:  { committee_toolKey: { committee, toolKey } },
    create: { committee, toolKey, hiddenBy: session.user.id },
    update: {},
  })

  return NextResponse.json({ ok: true }, { status: 201 })
}

// DELETE — restore (unhide) a preset tool
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { committee, toolKey } = bodySchema.parse(await req.json())

  if (!(await canEditCommittee(session.user.id, session.user.role, committee))) {
    return NextResponse.json({ error: "管理員或組長專屬功能" }, { status: 403 })
  }

  await prisma.committeeHiddenTool.deleteMany({ where: { committee, toolKey } })

  return NextResponse.json({ ok: true })
}
