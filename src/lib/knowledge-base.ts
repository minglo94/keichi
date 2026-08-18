// ============================================================
// Knowledge base — chunking, indexing, and hybrid (FTS + vector) retrieval.
// Phase 2b of the RAG layer (see AGENT_HANDOFF.md).
// ============================================================
import { prisma } from "@/lib/prisma"
import { getEmbedding, toVectorLiteral, EMBEDDING_DIMENSIONS } from "@/lib/embeddings"
import type { KnowledgeSourceType } from "@prisma/client"

const TARGET_CHUNK_CHARS = 700 // ≈ 500-800 tokens for mixed Chinese/English text
const MAX_CHUNK_CHARS = 1000

/**
 * Splits text into chunks of roughly TARGET_CHUNK_CHARS, preferring
 * paragraph and sentence boundaries over mid-sentence cuts. Character-based
 * rather than a real tokenizer — Chinese has no word-boundary whitespace, so
 * a char count is a more universal proxy for token count than a word split.
 */
export function chunkText(text: string): string[] {
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const chunks: string[] = []
  let current = ""

  const flush = () => {
    if (current.trim()) chunks.push(current.trim())
    current = ""
  }

  for (const para of paragraphs) {
    if (para.length > MAX_CHUNK_CHARS) {
      // Single paragraph too long on its own — split by sentence boundary.
      flush()
      const sentences = para.split(/(?<=[。！？.!?])\s*/)
      let sentenceChunk = ""
      for (const sentence of sentences) {
        if (sentenceChunk.length + sentence.length > TARGET_CHUNK_CHARS && sentenceChunk) {
          chunks.push(sentenceChunk.trim())
          sentenceChunk = ""
        }
        sentenceChunk += sentence
      }
      if (sentenceChunk.trim()) chunks.push(sentenceChunk.trim())
      continue
    }

    if (current.length + para.length > TARGET_CHUNK_CHARS && current) {
      flush()
    }
    current += (current ? "\n\n" : "") + para
  }
  flush()

  return chunks
}

export interface IndexDocumentInput {
  title: string
  sourceType: KnowledgeSourceType
  sourceId?: string
  ownerId: string
  content: string
  isStudentData?: boolean
}

/**
 * Chunks `content`, embeds each chunk, and stores it as a KnowledgeDocument
 * + KnowledgeChunk rows. Embedding failures for individual chunks are
 * swallowed (chunk is still stored with a NULL embedding, searchable via
 * FTS but not vector similarity) — indexing should never block the
 * caller's primary action (e.g. saving an AgentDocument).
 */
export async function indexDocument(input: IndexDocumentInput): Promise<string> {
  const doc = await prisma.knowledgeDocument.create({
    data: {
      title: input.title,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      ownerId: input.ownerId,
      isStudentData: input.isStudentData ?? false,
    },
  })

  const chunks = chunkText(input.content)

  for (let i = 0; i < chunks.length; i++) {
    const chunkContent = chunks[i]
    const chunk = await prisma.knowledgeChunk.create({
      data: {
        documentId: doc.id,
        chunkIndex: i,
        content: chunkContent,
        tokenCount: Math.ceil(chunkContent.length / 4), // rough approximation
      },
    })

    try {
      const embedding = await getEmbedding(chunkContent, { isStudentData: input.isStudentData })
      if (embedding.length !== EMBEDDING_DIMENSIONS) {
        console.error(
          `[knowledge-base] embedding dimension mismatch: got ${embedding.length}, expected ${EMBEDDING_DIMENSIONS} — skipping vector for chunk ${chunk.id}`
        )
        continue
      }
      await prisma.$executeRaw`
        UPDATE "KnowledgeChunk"
        SET embedding = ${toVectorLiteral(embedding)}::vector
        WHERE id = ${chunk.id}
      `
    } catch (err) {
      console.error("[knowledge-base] embedding failed, chunk stored without vector:", err)
    }
  }

  return doc.id
}

export interface RetrievedChunk {
  chunkId: string
  documentId: string
  documentTitle: string
  content: string
  score: number
}

/**
 * Hybrid retrieval: trigram similarity (works even for chunks with no
 * embedding yet) + vector cosine similarity, combined via reciprocal rank
 * fusion (RRF) — simpler and more robust to score-scale mismatches than
 * trying to normalize and average two different similarity metrics directly.
 */
export async function hybridSearch(
  query: string,
  ownerId: string,
  opts: { limit?: number; isStudentData?: boolean } = {}
): Promise<RetrievedChunk[]> {
  const limit = opts.limit ?? 8
  const candidatePoolSize = limit * 4

  const ftsResults = await prisma.$queryRaw<
    { id: string; documentId: string; documentTitle: string; content: string }[]
  >`
    SELECT kc.id, kc."documentId", kd.title AS "documentTitle", kc.content
    FROM "KnowledgeChunk" kc
    JOIN "KnowledgeDocument" kd ON kd.id = kc."documentId"
    WHERE kd."ownerId" = ${ownerId}
      AND similarity(kc.content, ${query}) > 0.1
    ORDER BY similarity(kc.content, ${query}) DESC
    LIMIT ${candidatePoolSize}
  `

  let vectorResults: { id: string; documentId: string; documentTitle: string; content: string }[] = []
  try {
    const queryEmbedding = await getEmbedding(query, { isStudentData: opts.isStudentData })
    if (queryEmbedding.length === EMBEDDING_DIMENSIONS) {
      const vectorLiteral = toVectorLiteral(queryEmbedding)
      vectorResults = await prisma.$queryRaw<
        { id: string; documentId: string; documentTitle: string; content: string }[]
      >`
        SELECT kc.id, kc."documentId", kd.title AS "documentTitle", kc.content
        FROM "KnowledgeChunk" kc
        JOIN "KnowledgeDocument" kd ON kd.id = kc."documentId"
        WHERE kd."ownerId" = ${ownerId}
          AND kc.embedding IS NOT NULL
        ORDER BY kc.embedding <=> ${vectorLiteral}::vector
        LIMIT ${candidatePoolSize}
      `
    }
  } catch (err) {
    console.error("[knowledge-base] vector search failed, falling back to FTS only:", err)
  }

  // Reciprocal rank fusion: score = sum of 1/(k + rank) across both lists.
  const RRF_K = 60
  const scores = new Map<string, { chunk: (typeof ftsResults)[number]; score: number }>()

  const addRanked = (list: typeof ftsResults) => {
    list.forEach((chunk, rank) => {
      const existing = scores.get(chunk.id)
      const contribution = 1 / (RRF_K + rank + 1)
      if (existing) {
        existing.score += contribution
      } else {
        scores.set(chunk.id, { chunk, score: contribution })
      }
    })
  }
  addRanked(ftsResults)
  addRanked(vectorResults)

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ chunk, score }) => ({
      chunkId: chunk.id,
      documentId: chunk.documentId,
      documentTitle: chunk.documentTitle,
      content: chunk.content,
      score,
    }))
}

/** Formats retrieved chunks as source text for generateQuiz, or as a report for an agent tool. */
export function formatRetrievedChunks(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return ""
  return chunks
    .map((c) => `【${c.documentTitle}】\n${c.content}`)
    .join("\n\n---\n\n")
}
