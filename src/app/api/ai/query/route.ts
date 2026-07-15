import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { queryKeida } from "@/lib/claude"
import { aiRateLimit } from "@/lib/rate-limit"
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

    const [announcements, behaviorRecords, calendarEvents, todos, activities] = await Promise.all([
      prisma.announcement.findMany({
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
        where:   { authorId: session.user.id },
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
        orderBy: { startDate: "asc" },
        where:   { startDate: { gte: new Date() } },
        take:    20,
      }),
      prisma.todo.findMany({
        where:   { createdById: session.user.id, status: { not: "DONE" } },
        orderBy: { dueDate: "asc" },
        take:    20,
      }),
      prisma.activity.findMany({
        where:   { createdById: session.user.id, startTime: { gte: new Date() } },
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
