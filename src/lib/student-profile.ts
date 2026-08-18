// ============================================================
// Student learning profiles (Phase 2c). Computed DETERMINISTICALLY from
// aiScore (MissionSubmission) and easeFactor (FlashcardReview) — no LLM
// call — so profiles are cheap to rebuild, have no hallucination risk, and
// can be regenerated as often as needed by an external scheduler hitting
// POST /api/cron/build-student-profiles (this codebase has no in-process
// job runner).
// ============================================================
import { prisma } from "@/lib/prisma"

const WEAK_SCORE_THRESHOLD = 60
const STRONG_SCORE_THRESHOLD = 85
const WEAK_EASE_THRESHOLD = 2.0 // SM-2 easeFactor below this = struggling to retain
const MAX_TOPICS = 5

interface TopicScore {
  topic: string
  avgScore: number
  count: number
}

function aggregateByTopic(rows: { topic: string; score: number }[]): TopicScore[] {
  const byTopic = new Map<string, { sum: number; count: number }>()
  for (const r of rows) {
    const entry = byTopic.get(r.topic) ?? { sum: 0, count: 0 }
    entry.sum += r.score
    entry.count += 1
    byTopic.set(r.topic, entry)
  }
  return Array.from(byTopic.entries()).map(([topic, { sum, count }]) => ({
    topic,
    avgScore: sum / count,
    count,
  }))
}

export interface StudentProfileResult {
  summary: string
  averageScore: number | null
  weakTopics: string[]
  strongTopics: string[]
}

/**
 * Builds one student's learning profile from their MissionSubmission
 * aiScores (grouped by mission title as a topic proxy) and FlashcardReview
 * easeFactor (grouped by deck title). Pure computation — no network calls.
 */
export async function buildStudentProfile(studentId: string): Promise<StudentProfileResult> {
  const submissions = await prisma.missionSubmission.findMany({
    where: { studentId, aiScore: { not: null } },
    select: { aiScore: true, mission: { select: { title: true } } },
  })

  const topicScores = aggregateByTopic(
    submissions
      .filter((s) => s.aiScore !== null)
      .map((s) => ({ topic: s.mission.title, score: s.aiScore! }))
  )

  const weakMissionTopics = topicScores
    .filter((t) => t.avgScore < WEAK_SCORE_THRESHOLD)
    .sort((a, b) => a.avgScore - b.avgScore)
    .slice(0, MAX_TOPICS)
    .map((t) => t.topic)

  const strongMissionTopics = topicScores
    .filter((t) => t.avgScore >= STRONG_SCORE_THRESHOLD)
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, MAX_TOPICS)
    .map((t) => t.topic)

  const flashcardReviews = await prisma.flashcardReview.findMany({
    where: { userId: studentId },
    select: { easeFactor: true, card: { select: { deck: { select: { title: true } } } } },
  })

  const deckEase = aggregateByTopic(
    flashcardReviews.map((r) => ({ topic: r.card.deck.title, score: r.easeFactor }))
  )
  const weakDecks = deckEase
    .filter((d) => d.avgScore < WEAK_EASE_THRESHOLD)
    .sort((a, b) => a.avgScore - b.avgScore)
    .slice(0, MAX_TOPICS)
    .map((d) => d.topic)

  const averageScore =
    submissions.length > 0
      ? submissions.reduce((sum, s) => sum + (s.aiScore ?? 0), 0) / submissions.length
      : null

  const weakTopics = Array.from(new Set([...weakMissionTopics, ...weakDecks])).slice(0, MAX_TOPICS)
  const strongTopics = strongMissionTopics

  const parts: string[] = []
  if (averageScore !== null) parts.push(`平均分 ${averageScore.toFixed(0)} 分（${submissions.length} 次提交）`)
  if (weakTopics.length > 0) parts.push(`較弱範疇：${weakTopics.join("、")}`)
  if (strongTopics.length > 0) parts.push(`較強範疇：${strongTopics.join("、")}`)
  if (parts.length === 0) parts.push("暫無足夠數據建立學習概況")

  return {
    summary: parts.join("；"),
    averageScore,
    weakTopics,
    strongTopics,
  }
}

/** Rebuilds and upserts the StudentLearningProfile row for one student. */
export async function refreshStudentProfile(studentId: string): Promise<void> {
  const result = await buildStudentProfile(studentId)
  await prisma.studentLearningProfile.upsert({
    where: { studentId },
    create: { studentId, ...result },
    update: { ...result },
  })
}

/** Rebuilds profiles for every student. Called by the cron endpoint. */
export async function refreshAllStudentProfiles(): Promise<number> {
  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    select: { id: true },
  })
  let count = 0
  for (const s of students) {
    try {
      await refreshStudentProfile(s.id)
      count++
    } catch (err) {
      console.error(`[student-profile] failed to refresh ${s.id}:`, err)
    }
  }
  return count
}
