// ============================================================
// Mission content JSON types
// These map to the `content` Json field in the Mission model
// ============================================================

export type VideoMissionContent = {
  youtubeId: string
  checkpoints: Array<{
    second: number       // Video timestamp to pause at
    question: string
    answer: string       // Expected answer (for auto-check)
  }>
  minWatchPct: number    // 0-100, minimum % of video to watch
}

export type FormMissionContent = {
  formUrl: string        // Google Forms embed URL
  completionMode: 'SELF_REPORT' | 'TEACHER_CONFIRM'
}

export type AiQuizMissionContent = {
  questions: Array<{
    id: string
    question: string
    options: string[]    // 4 choices (A/B/C/D)
    answer: number       // Index of correct option (0-3)
    explanation: string
    difficulty: 'BASIC' | 'ADVANCED' | 'CHALLENGE'
  }>
  passScore: number      // Minimum score to pass (e.g. 70)
  generatedBy: string    // Model used (claude-sonnet-4-5)
  sourceType: 'TEXT' | 'PDF' | 'YOUTUBE'
}

export type PromptMissionContent = {
  scenario: string       // Task description shown to student
  rubric: string         // Grading criteria sent to Claude Haiku
  level: 'FILL_IN' | 'IMPROVE' | 'FREE'  // Prompt Engineering tier
  template?: string      // Scaffold for FILL_IN level
  badExample?: string    // For IMPROVE level: prompt to fix
  exampleGood?: string   // Optional reference for teacher
}

// Union type for use in API handlers
export type MissionContent =
  | VideoMissionContent
  | FormMissionContent
  | AiQuizMissionContent
  | PromptMissionContent

// ─────────────────────────────────────────
// Submission content JSON types
// Maps to the `content` Json field in MissionSubmission
// ─────────────────────────────────────────

export type VideoSubmissionContent = {
  watchedPct: number
  checkpointAnswers: Record<string, string> // {second: answer}
}

export type FormSubmissionContent = {
  selfReported: boolean
  formResponseUrl?: string
}

export type AiQuizSubmissionContent = {
  answers: number[]    // Selected option index per question
  score: number        // Calculated score 0-100
  timeSpentSec: number
}

export type PromptSubmissionContent = {
  promptText: string
  testOutput?: string  // Optional: what AI returned when student tested it
}

export type SubmissionContent =
  | VideoSubmissionContent
  | FormSubmissionContent
  | AiQuizSubmissionContent
  | PromptSubmissionContent

// ─────────────────────────────────────────
// AI API response types
// ─────────────────────────────────────────

export type AiQuizGenerationResponse = {
  questions: AiQuizMissionContent['questions']
}

export type PromptEvaluationResponse = {
  safe: boolean
  reason?: string        // If safe=false, why it was rejected
  score?: number         // 0-100 total
  breakdown?: {
    clarity: number      // 0-25
    completeness: number // 0-25
    structure: number    // 0-25
    creativity: number   // 0-25
  }
  feedback?: string      // ≤80 chars, Traditional Chinese
}

// ─────────────────────────────────────────
// Pusher event payload types
// ─────────────────────────────────────────

export type PusherPointsAwardedPayload = {
  userId: string
  amount: number
  reason: string
  totalPoints: number  // New running total for instant UI update
  note?: string
}

export type PusherMissionApprovedPayload = {
  studentId: string
  missionId: string
  missionTitle: string
  pointsAwarded: number
  unlockedMissionIds: string[]  // Missions now unlocked for this student
}

export type PusherNewMissionPayload = {
  missionId: string
  title: string
  type: string
  pointsReward: number
}
