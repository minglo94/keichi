// ============================================================
// Embeddings — provider-switchable, privacy-aware.
//
// Follows the same provider config as src/lib/llm.ts (getLLMConfig):
// - anthropic / openrouter path → Voyage AI (voyage-3.5), cloud
// - local path                  → local OpenAI-compatible server
//   (Ollama / LM Studio), same LOCAL_LLM_BASE_URL as chat
//
// Callers MUST pass `isStudentData: true` for any text that could
// identify a student (names, behaviour records, submissions tied to
// a student). That forces the local provider regardless of the
// school's configured chat provider — student data must not leave
// the school's own infrastructure for embedding (私隱條例).
//
// Both REST calls use the OpenAI embeddings response shape
// ({ data: [{ embedding: number[] }] }), which Voyage AI and every
// OpenAI-compatible local server (Ollama, LM Studio) implement.
// ============================================================
import { getLLMConfig } from "@/lib/llm"

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings"
const VOYAGE_MODEL = "voyage-3.5"
export const EMBEDDING_DIMENSIONS = 1024 // must match prisma schema's vector(1024)

export interface EmbedOptions {
  /** Forces the local provider regardless of the configured chat provider. */
  isStudentData?: boolean
}

/**
 * Returns an embedding vector for `text`. Throws if the required
 * provider isn't configured (no VOYAGE_API_KEY / local server unreachable) —
 * callers should catch and skip indexing that chunk rather than fail the
 * whole request, since embeddings are a value-add, not a hard dependency.
 */
export async function getEmbedding(text: string, opts: EmbedOptions = {}): Promise<number[]> {
  const cfg = await getLLMConfig()
  const useLocal = opts.isStudentData || cfg.provider === "local"

  if (useLocal) {
    return getLocalEmbedding(text, opts.isStudentData ? undefined : cfg.baseUrl)
  }
  return getVoyageEmbedding(text)
}

async function getVoyageEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.VOYAGE_API_KEY
  if (!apiKey) throw new Error("VOYAGE_API_KEY not configured")

  const res = await fetch(VOYAGE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: [text], model: VOYAGE_MODEL }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Voyage embeddings ${res.status}: ${detail.slice(0, 200)}`)
  }

  const json = await res.json()
  const embedding = json?.data?.[0]?.embedding
  if (!Array.isArray(embedding)) throw new Error("Voyage embeddings: unexpected response shape")
  return embedding
}

async function getLocalEmbedding(text: string, baseUrlOverride?: string): Promise<number[]> {
  const baseUrl = (baseUrlOverride || process.env.LOCAL_LLM_BASE_URL || "http://localhost:1234/v1").replace(/\/$/, "")
  const model = process.env.LOCAL_EMBEDDING_MODEL || "nomic-embed-text"

  const res = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: text, model }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => "")
    throw new Error(`Local embeddings ${res.status}: ${detail.slice(0, 200)}`)
  }

  const json = await res.json()
  const embedding = json?.data?.[0]?.embedding
  if (!Array.isArray(embedding)) throw new Error("Local embeddings: unexpected response shape")
  return embedding
}

/** Formats a raw embedding array as a pgvector literal for use in $queryRaw/$executeRaw. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`
}
