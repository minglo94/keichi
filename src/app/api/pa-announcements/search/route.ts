import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { completeLLM } from "@/lib/llm"
import { aiRateLimit } from "@/lib/rate-limit"
import { z } from "zod"

const schema = z.object({
  query: z.string().min(1).max(500),
})

// Natural-language Q&A over PA-announcement (宣佈訊息) history.
// Retrieve-then-answer: stuff the most recent announcements into context and
// let the provider-switchable LLM answer grounded on them.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const limited = await aiRateLimit(session.user.id, session.user.role, "query")
  if (limited) return NextResponse.json(limited.body, { status: 429, headers: limited.headers })

  const { query } = schema.parse(await req.json())

  const announcements = await prisma.announcement.findMany({
    orderBy: { publishAt: "desc" },
    take:    60,
    select: {
      title:     true,
      body:      true,
      priority:  true,
      status:    true,
      publishAt: true,
      category:  { select: { name: true } },
      author:    { select: { name: true } },
    },
  })

  if (announcements.length === 0) {
    return NextResponse.json({ answer: "目前沒有任何公告記錄可供查詢。" })
  }

  const context = announcements
    .map((a, i) => {
      const date = a.publishAt.toISOString().slice(0, 10)
      const cat  = a.category?.name ?? "未分類"
      return `${i + 1}. [${date}]（${cat}／${a.priority}／${a.status}）${a.title}\n${a.body}`
    })
    .join("\n\n")

  const answer = await completeLLM(
    "claude",
    [{ role: "user", content: `問題：${query}\n\n以下是宣佈訊息記錄：\n\n${context}` }],
    {
      system:
        "你是學校宣佈訊息的查詢助理。只根據下方提供的宣佈記錄，用繁體中文回答老師的問題。" +
        "若記錄中找不到答案，請直接說明沒有相關宣佈，切勿虛構。回答簡潔，並在適用時註明宣佈日期。",
      maxTokens: 800,
    }
  )

  return NextResponse.json({ answer })
}
