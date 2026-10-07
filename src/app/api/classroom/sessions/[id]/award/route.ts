import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin } from "@/lib/roles"
import { requireSessionAccess } from "@/lib/class-perm"
import { awardSession, withdrawSession } from "@/lib/lesson-award"
import { dbErrorMessage } from "@/lib/db-error"

type Params = { params: { id: string } }

// POST — 發放積點: pay out this lesson's pending 課堂表現.
export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const gate = await requireSessionAccess(params.id, session.user)
  if (gate instanceof NextResponse) return gate
  try {
    return NextResponse.json(await awardSession(params.id, session.user.id))
  } catch (err) {
    const msg = dbErrorMessage(err)
    console.error("[award]", err)
    return NextResponse.json({ error: msg ?? "發放失敗，未有任何積點被發出" }, { status: msg ? 503 : 500 })
  }
}

// DELETE — 撤回: remove exactly the points this lesson paid out.
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const gate = await requireSessionAccess(params.id, session.user)
  if (gate instanceof NextResponse) return gate
  try {
    return NextResponse.json(await withdrawSession(params.id))
  } catch (err) {
    const msg = dbErrorMessage(err)
    console.error("[withdraw]", err)
    return NextResponse.json({ error: msg ?? "撤回失敗" }, { status: msg ? 503 : 500 })
  }
}
