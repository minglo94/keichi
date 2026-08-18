// ============================================================
// Cross-conversation memory (Phase 2c). One rolling summary per
// AgentConversation, refreshed whenever a new assistant message is
// appended. Recent summaries from a teacher's other conversations get
// injected into the dispatcher/specialist system prompt so Keida
// "remembers" what was worked on recently, across separate chat threads.
// ============================================================
import { prisma } from "@/lib/prisma"
import { completeLLM } from "@/lib/llm"

const MAX_TRANSCRIPT_CHARS = 6000
const RECENT_MEMORY_LIMIT = 5

const SUMMARY_SYSTEM = `你負責將一段老師與 AI 助理 Keida 嘅對話總結為 3-5 句廣東話書面語。
只講重點：老師想要咩、Keida 生成咗咩、有冇未完成嘅事。唔好逐句覆述，唔好加入無關評論。`

/**
 * Regenerates the rolling summary for a conversation from its full message
 * history and upserts it into AgentMemory. Fire-and-forget from the caller
 * — never let a summarization failure block message persistence.
 */
export async function updateConversationMemory(conversationId: string, userId: string): Promise<void> {
  const messages = await prisma.agentMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  })
  if (messages.length === 0) return

  const transcript = messages
    .map((m) => `${m.role === "user" ? "老師" : "Keida"}：${m.content}`)
    .join("\n")
    .slice(0, MAX_TRANSCRIPT_CHARS)

  const summary = await completeLLM("claude", [{ role: "user", content: transcript }], {
    system: SUMMARY_SYSTEM,
    maxTokens: 300,
  })

  await prisma.agentMemory.upsert({
    where: { conversationId },
    create: { conversationId, userId, summary },
    update: { summary },
  })
}

export interface RecentMemory {
  conversationId: string
  conversationTitle: string
  summary: string
  updatedAt: Date
}

/**
 * Fetches a teacher's most recent conversation summaries, excluding the
 * current conversation (if any), for injection into a new chat's context.
 */
export async function getRecentMemories(
  userId: string,
  excludeConversationId?: string
): Promise<RecentMemory[]> {
  const memories = await prisma.agentMemory.findMany({
    where: {
      userId,
      ...(excludeConversationId ? { conversationId: { not: excludeConversationId } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: RECENT_MEMORY_LIMIT,
    include: { conversation: { select: { title: true } } },
  })

  return memories.map((m) => ({
    conversationId: m.conversationId,
    conversationTitle: m.conversation.title,
    summary: m.summary,
    updatedAt: m.updatedAt,
  }))
}

/** Formats recent memories as a context block for the system prompt. */
export function formatRecentMemories(memories: RecentMemory[]): string {
  if (memories.length === 0) return ""
  const lines = memories.map(
    (m) => `- [${m.conversationTitle}]（${m.updatedAt.toISOString().split("T")[0]}）${m.summary}`
  )
  return `\n\n---\n[近期對話記憶 — 呢位老師最近同你傾過嘅嘢，可以自然噉提返，唔使逐句覆述]\n${lines.join("\n")}`
}
