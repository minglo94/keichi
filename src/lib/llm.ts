// Streaming LLM wrapper for the agent module.
//
// Supports three providers, switchable at runtime from the admin settings page
// (stored in SchoolSetting; secrets stay in env vars):
//   - anthropic  → Claude via the Anthropic SDK
//   - openrouter → any model via OpenRouter (OpenAI-compatible API)
//   - local      → a self-hosted OpenAI-compatible server (Ollama / LM Studio)

import Anthropic from "@anthropic-ai/sdk"
import { prisma } from "@/lib/prisma"

// Kept for call-site compatibility; the active provider now comes from settings.
export type Engine = "claude" | "auto"

export type LLMProvider = "anthropic" | "openrouter" | "local"

export interface LLMMessage {
  role:    "user" | "assistant"
  content: string
}

export interface LLMOptions {
  system?:    string
  model?:     string
  maxTokens?: number
}

export interface LLMConfig {
  provider: LLMProvider
  model:    string
  baseUrl:  string       // OpenAI-compatible base (openrouter/local)
  apiKey:   string       // provider secret from env
  hasKey:   boolean      // whether the required secret is configured
}

// ─── Settings keys + defaults ────────────────────────────────────────────────

export const LLM_KEYS = { provider: "llmProvider", model: "llmModel", baseUrl: "llmBaseUrl" }

export const DEFAULT_MODEL: Record<LLMProvider, string> = {
  anthropic:  "claude-sonnet-4-6",
  openrouter: "anthropic/claude-3.5-sonnet",
  local:      "local-model",
}

const OPENROUTER_BASE = "https://openrouter.ai/api/v1"
const DEFAULT_LOCAL_BASE = process.env.LOCAL_LLM_BASE_URL || "http://localhost:1234/v1"

/** Read the active provider config from SchoolSetting (env supplies secrets). */
export async function getLLMConfig(): Promise<LLMConfig> {
  let rows: { key: string; value: string }[] = []
  try {
    rows = await prisma.schoolSetting.findMany({
      where: { key: { in: [LLM_KEYS.provider, LLM_KEYS.model, LLM_KEYS.baseUrl] } },
    })
  } catch { /* table may not exist yet — fall back to env/defaults */ }
  const m = new Map(rows.map((r) => [r.key, r.value]))

  const provider = ((m.get(LLM_KEYS.provider) || process.env.LLM_PROVIDER || "anthropic") as LLMProvider)
  const model    = m.get(LLM_KEYS.model) || DEFAULT_MODEL[provider] || DEFAULT_MODEL.anthropic

  if (provider === "openrouter") {
    const apiKey = process.env.OPENROUTER_API_KEY || ""
    return { provider, model, baseUrl: OPENROUTER_BASE, apiKey, hasKey: !!apiKey }
  }
  if (provider === "local") {
    const baseUrl = m.get(LLM_KEYS.baseUrl) || DEFAULT_LOCAL_BASE
    const apiKey  = process.env.LOCAL_LLM_API_KEY || ""    // usually not required
    return { provider, model, baseUrl, apiKey, hasKey: true }
  }
  // anthropic (default)
  const apiKey = process.env.ANTHROPIC_API_KEY || ""
  return { provider, model, baseUrl: "", apiKey, hasKey: !!apiKey }
}

// ─── Anthropic ───────────────────────────────────────────────────────────────

let anthropicClient: Anthropic | null = null
function anthropic(): Anthropic {
  if (!anthropicClient) anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return anthropicClient
}

async function* streamAnthropic(messages: LLMMessage[], opts: LLMOptions, cfg: LLMConfig): AsyncGenerator<string> {
  const stream = await anthropic().messages.stream({
    model:      opts.model ?? cfg.model,
    max_tokens: opts.maxTokens ?? 4096,
    system:     opts.system ?? "",
    messages,
  })
  for await (const chunk of stream) {
    if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
      yield chunk.delta.text
    }
  }
}

// ─── OpenAI-compatible (OpenRouter / local) ──────────────────────────────────

async function* streamOpenAICompat(messages: LLMMessage[], opts: LLMOptions, cfg: LLMConfig): AsyncGenerator<string> {
  const oaMessages = [
    ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
    ...messages,
  ]

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`
  if (cfg.provider === "openrouter") {
    // Header VALUES must be ASCII (ByteString) — non-ASCII throws at fetch()
    // time ("Cannot convert argument to a ByteString..."). Keep this Latin-1.
    headers["HTTP-Referer"] = process.env.NEXT_PUBLIC_APP_URL || "https://keichi.edu.hk"
    headers["X-Title"]      = "EduPortal Keida"
  }

  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model:      opts.model ?? cfg.model,
      messages:   oaMessages,
      max_tokens: opts.maxTokens ?? 4096,
      stream:     true,
    }),
  })

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "")
    throw new Error(`LLM ${cfg.provider} ${res.status}: ${detail.slice(0, 200)}`)
  }

  const reader  = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split("\n")
    buf = lines.pop() ?? ""
    for (const line of lines) {
      const t = line.trim()
      if (!t.startsWith("data:")) continue
      const payload = t.slice(5).trim()
      if (payload === "[DONE]") return
      try {
        const json = JSON.parse(payload)
        const delta = json?.choices?.[0]?.delta?.content
        if (typeof delta === "string" && delta) yield delta
      } catch { /* skip keep-alive / partial */ }
    }
  }
}

// ─── Public API (unchanged signature) ────────────────────────────────────────

export async function* streamLLM(
  _engine: Engine,
  messages: LLMMessage[],
  opts: LLMOptions = {},
): AsyncGenerator<string> {
  const cfg = await getLLMConfig()
  if (cfg.provider === "anthropic") {
    yield* streamAnthropic(messages, opts, cfg)
  } else {
    yield* streamOpenAICompat(messages, opts, cfg)
  }
}

export async function completeLLM(
  engine: Engine,
  messages: LLMMessage[],
  opts: LLMOptions = {},
): Promise<string> {
  let result = ""
  for await (const chunk of streamLLM(engine, messages, opts)) {
    result += chunk
  }
  return result
}
