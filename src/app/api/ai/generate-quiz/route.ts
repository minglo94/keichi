import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { generateQuiz } from "@/lib/claude"
import { aiRateLimit } from "@/lib/rate-limit"
import { hybridSearch, formatRetrievedChunks } from "@/lib/knowledge-base"
import { z } from "zod"

const schema = z
  .object({
    sourceText: z.string().min(50).max(8000).optional(),
    // Alternative to pasting sourceText: retrieve relevant chunks from the
    // teacher's own indexed knowledge base (Phase 2b) instead.
    topicQuery: z.string().min(1).max(200).optional(),
    count: z.number().int().min(3).max(10).default(5),
    difficulty: z.enum(["BASIC", "ADVANCED", "CHALLENGE"]).default("BASIC"),
  })
  .refine((d) => d.sourceText || d.topicQuery, {
    message: "Provide either sourceText or topicQuery",
  })

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const limited = await aiRateLimit(session.user.id, session.user.role, "quiz")
  if (limited) return NextResponse.json(limited.body, { status: 429, headers: limited.headers })

  const data = schema.parse(await req.json())

  let sourceText = data.sourceText
  if (!sourceText && data.topicQuery) {
    const chunks = await hybridSearch(data.topicQuery, session.user.id)
    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "知識庫暫時搵唔到同呢個主題相關嘅教材，請貼入文字或先上載教材。" },
        { status: 422 }
      )
    }
    sourceText = formatRetrievedChunks(chunks).slice(0, 8000)
  }

  try {
    const result = await generateQuiz(sourceText!, data.count, data.difficulty)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof Error && error.message === "CONTENT_UNSAFE") {
      return NextResponse.json({ error: "Content flagged as unsafe" }, { status: 422 })
    }
    throw error
  }
}
