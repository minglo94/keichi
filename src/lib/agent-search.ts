// ============================================================
// search_school_data — Postgres trigram full-text search across
// school records, for Keida agents ([NEED_TOOL:search_school_data])
// and Ask ICHI (/api/ai/query).
//
// Uses pg_trgm similarity() rather than tsvector, because default
// Postgres tsvector cannot segment Traditional Chinese text (no
// word boundaries) — trigram matching works on any script.
//
// Each table gets its own $queryRaw call (simpler and safer than
// one large UNION across differently-shaped tables) and results
// are merged + ranked in JS. Values are passed through Prisma's
// tagged-template parameterization ($queryRaw`...${value}...`) —
// never string-concatenated — so this is not vulnerable to SQL
// injection despite using raw SQL.
// ============================================================
import { prisma } from "@/lib/prisma"

const SIMILARITY_THRESHOLD = 0.15
const PER_TABLE_LIMIT = 8
const RESULT_LIMIT = 15

export type SearchSource =
  | "announcement"
  | "behavior_record"
  | "calendar_event"
  | "todo"
  | "activity"
  | "agent_document"

export interface SearchResult {
  source: SearchSource
  id: string
  title: string
  snippet: string
  date: Date
  similarity: number
}

function truncate(text: string, max = 200): string {
  return text.length > max ? text.slice(0, max) + "…" : text
}

/**
 * Searches across Announcement / BehaviorRecord / CalendarEvent / Todo /
 * Activity / AgentDocument for text similar to `query`, scoped the same
 * way each table is scoped in /api/ai/query today (BehaviorRecord/Todo/
 * Activity/AgentDocument are personal to the caller; Announcement/
 * CalendarEvent are school-wide).
 */
export async function searchSchoolData(
  query: string,
  userId: string
): Promise<SearchResult[]> {
  const q = query.trim()
  if (!q) return []

  const [announcements, behaviorRecords, calendarEvents, todos, activities, agentDocuments] =
    await Promise.all([
      prisma.$queryRaw<
        { id: string; title: string; body: string; createdAt: Date; similarity: number }[]
      >`
        SELECT id, title, body, "createdAt",
               GREATEST(similarity(title, ${q}), similarity(body, ${q})) AS similarity
        FROM "Announcement"
        WHERE similarity(title, ${q}) > ${SIMILARITY_THRESHOLD}
           OR similarity(body, ${q}) > ${SIMILARITY_THRESHOLD}
        ORDER BY similarity DESC
        LIMIT ${PER_TABLE_LIMIT}
      `,
      prisma.$queryRaw<
        { id: string; studentName: string; description: string; date: Date; similarity: number }[]
      >`
        SELECT id, "studentName", description, date,
               GREATEST(similarity("studentName", ${q}), similarity(description, ${q})) AS similarity
        FROM "BehaviorRecord"
        WHERE "authorId" = ${userId}
          AND (similarity("studentName", ${q}) > ${SIMILARITY_THRESHOLD}
           OR similarity(description, ${q}) > ${SIMILARITY_THRESHOLD})
        ORDER BY similarity DESC
        LIMIT ${PER_TABLE_LIMIT}
      `,
      prisma.$queryRaw<
        { id: string; title: string; description: string | null; startDate: Date; similarity: number }[]
      >`
        SELECT id, title, description, "startDate",
               GREATEST(similarity(title, ${q}), similarity(COALESCE(description, ''), ${q})) AS similarity
        FROM "CalendarEvent"
        WHERE similarity(title, ${q}) > ${SIMILARITY_THRESHOLD}
           OR similarity(COALESCE(description, ''), ${q}) > ${SIMILARITY_THRESHOLD}
        ORDER BY similarity DESC
        LIMIT ${PER_TABLE_LIMIT}
      `,
      prisma.$queryRaw<
        { id: string; title: string; description: string | null; createdAt: Date; similarity: number }[]
      >`
        SELECT id, title, description, "createdAt",
               GREATEST(similarity(title, ${q}), similarity(COALESCE(description, ''), ${q})) AS similarity
        FROM "Todo"
        WHERE "createdById" = ${userId}
          AND (similarity(title, ${q}) > ${SIMILARITY_THRESHOLD}
           OR similarity(COALESCE(description, ''), ${q}) > ${SIMILARITY_THRESHOLD})
        ORDER BY similarity DESC
        LIMIT ${PER_TABLE_LIMIT}
      `,
      prisma.$queryRaw<
        { id: string; title: string; description: string | null; startTime: Date; similarity: number }[]
      >`
        SELECT id, title, description, "startTime",
               GREATEST(similarity(title, ${q}), similarity(COALESCE(description, ''), ${q})) AS similarity
        FROM "Activity"
        WHERE "createdById" = ${userId}
          AND (similarity(title, ${q}) > ${SIMILARITY_THRESHOLD}
           OR similarity(COALESCE(description, ''), ${q}) > ${SIMILARITY_THRESHOLD})
        ORDER BY similarity DESC
        LIMIT ${PER_TABLE_LIMIT}
      `,
      prisma.$queryRaw<
        { id: string; title: string; content: string; createdAt: Date; similarity: number }[]
      >`
        SELECT id, title, content, "createdAt",
               GREATEST(similarity(title, ${q}), similarity(content, ${q})) AS similarity
        FROM "AgentDocument"
        WHERE "userId" = ${userId}
          AND (similarity(title, ${q}) > ${SIMILARITY_THRESHOLD}
           OR similarity(content, ${q}) > ${SIMILARITY_THRESHOLD})
        ORDER BY similarity DESC
        LIMIT ${PER_TABLE_LIMIT}
      `,
    ])

  const results: SearchResult[] = [
    ...announcements.map((r) => ({
      source: "announcement" as const,
      id: r.id,
      title: r.title,
      snippet: truncate(r.body),
      date: r.createdAt,
      similarity: r.similarity,
    })),
    ...behaviorRecords.map((r) => ({
      source: "behavior_record" as const,
      id: r.id,
      title: r.studentName,
      snippet: truncate(r.description),
      date: r.date,
      similarity: r.similarity,
    })),
    ...calendarEvents.map((r) => ({
      source: "calendar_event" as const,
      id: r.id,
      title: r.title,
      snippet: truncate(r.description ?? ""),
      date: r.startDate,
      similarity: r.similarity,
    })),
    ...todos.map((r) => ({
      source: "todo" as const,
      id: r.id,
      title: r.title,
      snippet: truncate(r.description ?? ""),
      date: r.createdAt,
      similarity: r.similarity,
    })),
    ...activities.map((r) => ({
      source: "activity" as const,
      id: r.id,
      title: r.title,
      snippet: truncate(r.description ?? ""),
      date: r.startTime,
      similarity: r.similarity,
    })),
    ...agentDocuments.map((r) => ({
      source: "agent_document" as const,
      id: r.id,
      title: r.title,
      snippet: truncate(r.content),
      date: r.createdAt,
      similarity: r.similarity,
    })),
  ]

  return results.sort((a, b) => b.similarity - a.similarity).slice(0, RESULT_LIMIT)
}

const SOURCE_LABELS: Record<SearchSource, string> = {
  announcement: "公告",
  behavior_record: "行為記錄",
  calendar_event: "行事曆",
  todo: "待辦事項",
  activity: "活動",
  agent_document: "AI 生成文件",
}

/** Formats search results as a Chinese markdown report for an LLM to read. */
export function formatSearchResults(query: string, results: SearchResult[]): string {
  if (results.length === 0) {
    return `搜尋「${query}」：無相關結果。請向用戶說明搵唔到相關紀錄，唔好虛構答案。`
  }

  const lines = [`搜尋「${query}」：找到 ${results.length} 筆相關結果（按相關度排序）`, ""]
  for (const r of results) {
    const dateStr = r.date.toISOString().split("T")[0]
    lines.push(`- **[${SOURCE_LABELS[r.source]}]** ${r.title}（${dateStr}）：${r.snippet}`)
  }
  return lines.join("\n")
}
