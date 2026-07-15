import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { LLM_KEYS, DEFAULT_MODEL, getLLMConfig } from "@/lib/llm"
import { z } from "zod"

// GET — current provider/model/baseUrl + which provider secrets are configured
// (booleans only; keys themselves are never returned). Admin only.
export async function GET() {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const cfg = await getLLMConfig()
  return NextResponse.json({
    provider: cfg.provider,
    model:    cfg.model,
    baseUrl:  cfg.baseUrl,
    defaults: DEFAULT_MODEL,
    keys: {
      anthropic:  Boolean(process.env.ANTHROPIC_API_KEY),
      openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    },
  })
}

const putSchema = z.object({
  provider: z.enum(["anthropic", "openrouter", "local"]),
  model:    z.string().max(120).optional(),
  baseUrl:  z.string().max(300).optional(),
})

// PUT — save provider/model/baseUrl to SchoolSetting. Admin only.
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { provider, model, baseUrl } = putSchema.parse(await req.json())

  const upserts = [
    prisma.schoolSetting.upsert({
      where:  { key: LLM_KEYS.provider },
      create: { key: LLM_KEYS.provider, value: provider },
      update: { value: provider },
    }),
    prisma.schoolSetting.upsert({
      where:  { key: LLM_KEYS.model },
      create: { key: LLM_KEYS.model, value: (model || DEFAULT_MODEL[provider]).trim() },
      update: { value: (model || DEFAULT_MODEL[provider]).trim() },
    }),
  ]
  if (baseUrl !== undefined) {
    upserts.push(prisma.schoolSetting.upsert({
      where:  { key: LLM_KEYS.baseUrl },
      create: { key: LLM_KEYS.baseUrl, value: baseUrl.trim() },
      update: { value: baseUrl.trim() },
    }))
  }
  await prisma.$transaction(upserts)

  return NextResponse.json({ ok: true })
}
