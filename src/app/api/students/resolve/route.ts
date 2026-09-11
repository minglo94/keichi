import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin } from "@/lib/roles"
import { resolveRoster } from "@/lib/student-resolve"
import { z } from "zod"

// Resolve pasted roster rows (班級 / 學號 / 姓名) to real student accounts, so
// an activity links to students — and therefore their emails — rather than
// storing loose text. The matching itself lives in src/lib/student-resolve.ts,
// shared with the activity 批量指派 box so the two can't disagree.
//
// Rows that match nothing come back with a reason so the teacher can fix them
// BEFORE saving, instead of being silently dropped.

const schema = z.object({
  rows: z.array(z.object({
    id:        z.number(),
    className: z.string().optional().default(""),
    studentId: z.string().optional().default(""),
    name:      z.string().optional().default(""),
  })).max(500),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { rows } = schema.parse(await req.json())
  return NextResponse.json({ results: await resolveRoster(rows) })
}
