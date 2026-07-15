import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { generateQuiz } from "@/lib/claude"
import { aiRateLimit } from "@/lib/rate-limit"
import { z } from "zod"

const schema = z.object({
  sourceText: z.string().min(50).max(8000),
  count: z.number().int().min(3).max(10).default(5),
  difficulty: z.enum(["BASIC", "ADVANCED", "CHALLENGE"]).default("BASIC"),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const limited = await aiRateLimit(session.user.id, session.user.role, "quiz")
  if (limited) return NextResponse.json(limited.body, { status: 429, headers: limited.headers })

  const data = schema.parse(await req.json())

  try {
    const result = await generateQuiz(data.sourceText, data.count, data.difficulty)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error && error.message === "CONTENT_UNSAFE") {
      return NextResponse.json({ error: "Content flagged as unsafe" }, { status: 422 })
    }
    throw error
  }
}
