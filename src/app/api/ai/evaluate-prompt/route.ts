import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { evaluatePrompt } from "@/lib/claude"
import { aiRateLimit } from "@/lib/rate-limit"
import { z } from "zod"
import type { PromptMissionContent } from "@/types/mission"

const schema = z.object({
  promptText: z.string().min(1).max(2000),
  missionContent: z.object({
    scenario: z.string(),
    rubric: z.string(),
    level: z.string(),
    template: z.string().optional(),
  }),
})

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const limited = await aiRateLimit(session.user.id, session.user.role, "evaluate")
  if (limited) return NextResponse.json(limited.body, { status: 429, headers: limited.headers })

  const { promptText, missionContent } = schema.parse(await req.json())

  const result = await evaluatePrompt(promptText, missionContent as PromptMissionContent)
  return NextResponse.json(result)
}
