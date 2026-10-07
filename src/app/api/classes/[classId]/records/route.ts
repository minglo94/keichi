import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin } from "@/lib/roles"
import { requireClassAccess } from "@/lib/class-perm"
import { loadRoster } from "@/lib/classroom-roster"
import { loadReview, parseFilter } from "@/lib/lesson-review"
import { dbErrorMessage } from "@/lib/db-error"

// GET — 回顧: records for this class over a date range, plus the roster so the
// 按學生 view can show students with nothing recorded (a clean row is
// information too).
export async function GET(req: NextRequest, { params }: { params: { classId: string } }) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const gate = await requireClassAccess(params.classId, session.user)
  if (gate instanceof NextResponse) return gate
  try {
    const filter = parseFilter(gate.cls.id, new URL(req.url).searchParams)
    const [records, roster] = await Promise.all([loadReview(filter), loadRoster(gate.cls.id, gate.cls.name)])
    return NextResponse.json({ records, roster, truncated: records.length >= 3000 })
  } catch (err) {
    const msg = dbErrorMessage(err)
    console.error("[records review]", err)
    return NextResponse.json({ error: msg ?? "未能載入紀錄" }, { status: msg ? 503 : 500 })
  }
}
