import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { queryKeida } from "@/lib/claude"
import { aiRateLimit } from "@/lib/rate-limit"
import { searchSchoolData } from "@/lib/agent-search"
import { z } from "zod"

const schema = z.object({
  query: z.string().min(1).max(500),
})

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const limited = await aiRateLimit(session.user.id, session.user.role, "query")
    if (limited) return NextResponse.json(limited.body, { status: 429, headers: limited.headers })

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('Missing ANTHROPIC_API_KEY')
      return NextResponse.json({ error: "AI service not configured" }, { status: 500 })
    }

    const body = await req.json()
    const { query } = schema.parse(body)

    console.log(`[AskKeida] Query: "${query}" from user ${session.user.id}`)

    // Retrieve-then-answer: combine a small recency anchor (so "what's coming
    // up" style questions still work) with trigram-search-matched records (so
    // questions about older records, e.g. an announcement from months ago,
    // are actually reachable — the old approach only ever saw the latest ~30
    // rows regardless of what was asked).
    const searchResults = await searchSchoolData(query, session.user.id)
    const matchedIds = (source: string) =>
      searchResults.filter((r) => r.source === source).map((r) => r.id)

    const [announcements, behaviorRecords, calendarEvents, todos, activities] = await Promise.all([
      prisma.announcement.findMany({
        where: {
          OR: [
            { createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
            { id: { in: matchedIds("announcement") } },
          ],
        },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: {
          title:     true,
          body:      true,
          target:    true,
          committee: true,
          priority:  true,
          createdAt: true,
          author:    { select: { name: true } },
        },
      }),
      prisma.behaviorRecord.findMany({
        where: {
          authorId: session.user.id,
          OR: [
            { date: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) } },
            { id: { in: matchedIds("behavior_record") } },
          ],
        },
        orderBy: { date: "desc" },
        take:    30,
        select: {
          date:        true,
          className:   true,
          studentName: true,
          type:        true,
          description: true,
          action:      true,
          resolved:    true,
        },
      }),
      prisma.calendarEvent.findMany({
        where: {
          OR: [
            { startDate: { gte: new Date() } },
            { id: { in: matchedIds("calendar_event") } },
          ],
        },
        orderBy: { startDate: "asc" },
        take: 20,
      }),
      prisma.todo.findMany({
        where: {
          createdById: session.user.id,
          OR: [
            { status: { not: "DONE" } },
            { id: { in: matchedIds("todo") } },
          ],
        },
        orderBy: { dueDate: "asc" },
        take:    20,
      }),
      prisma.activity.findMany({
        where: {
          createdById: session.user.id,
          OR: [
            { startTime: { gte: new Date() } },
            { id: { in: matchedIds("activity") } },
          ],
        },
        orderBy: { startTime: "asc" },
        take:    20,
        include: { assignments: { include: { student: { select: { name: true } } } } }
      })
    ])

    const answer = await queryKeida(query, announcements, behaviorRecords, calendarEvents, todos, activities)

    return NextResponse.json({ answer })
  } catch (error) {
    console.error('API Error (/api/ai/query):', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal Server Error" },
      { status: 500 }
    )
  }
}
