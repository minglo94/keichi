import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { evaluatePrompt } from "@/lib/claude"
import { aiRateLimit } from "@/lib/rate-limit"
import type { PromptMissionContent, PromptSubmissionContent } from "@/types/mission"

type RouteParams = { params: { missionId: string } }

export async function POST(req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || session.user.role !== "STUDENT") {
    return NextResponse.json({ error: "Students only" }, { status: 403 })
  }

  const limited = await aiRateLimit(session.user.id, session.user.role, "submit")
  if (limited) return NextResponse.json(limited.body, { status: 429, headers: limited.headers })

  const mission = await prisma.mission.findUnique({
    where: { id: params.missionId, status: "PUBLISHED" },
  })
  if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 })

  // Check prerequisite
  if (mission.prereqId) {
    const prereqDone = await prisma.missionSubmission.findFirst({
      where: { missionId: mission.prereqId, studentId: session.user.id, status: "APPROVED" },
    })
    if (!prereqDone) {
      return NextResponse.json({ error: "Complete prerequisite mission first" }, { status: 403 })
    }
  }

  // Check no duplicate
  const existing = await prisma.missionSubmission.findUnique({
    where: { missionId_studentId: { missionId: params.missionId, studentId: session.user.id } },
  })
  if (existing) return NextResponse.json({ error: "Already submitted" }, { status: 409 })

  const body = await req.json()
  let aiScore: number | undefined
  let aiFeedback: string | undefined

  // AI evaluation for PROMPT type
  if (mission.type === "PROMPT") {
    const content = mission.content as PromptMissionContent
    const submission = body.content as PromptSubmissionContent
    try {
      const evaluation = await evaluatePrompt(submission.promptText, content)
      if (!evaluation.safe) {
        return NextResponse.json({ error: "Content flagged", reason: evaluation.reason }, { status: 422 })
      }
      aiScore = evaluation.score
      aiFeedback = evaluation.feedback
    } catch {
      // Non-blocking: save submission without AI score if Claude is unavailable
    }
  }

  const submission = await prisma.missionSubmission.create({
    data: {
      missionId: params.missionId,
      studentId: session.user.id,
      content: body.content,
      aiScore,
      aiFeedback,
    },
  })

  return NextResponse.json({ submission, aiScore, aiFeedback }, { status: 201 })
}
