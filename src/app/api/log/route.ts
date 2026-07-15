import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin } from "@/lib/roles"
import { logToObsidian } from "@/lib/obsidian-log"
import { z } from "zod"

const schema = z.object({
  title:   z.string().min(1).max(200),
  content: z.string().max(10000),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 })

  logToObsidian(parsed.data.title, parsed.data.content)
  return NextResponse.json({ success: true })
}
