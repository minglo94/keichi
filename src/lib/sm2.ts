// ============================================================
// SM-2 Spaced Repetition Algorithm
// Based on SuperMemo 2 algorithm by Piotr Wozniak
//
// Grade scale (matches Anki conventions):
//   0 = Again  (complete blackout)
//   1 = Hard   (significant difficulty)
//   2 = Good   (correct with effort)
//   3 = Easy   (perfect recall)
// ============================================================

export type ReviewGrade = 0 | 1 | 2 | 3

export type SM2State = {
  easeFactor: number   // Default 2.5, min 1.3
  interval: number     // Days until next review
  repetitions: number  // Consecutive successful reviews
}

export type SM2Result = SM2State & {
  nextReviewAt: Date
}

const MIN_EASE_FACTOR = 1.3
const INITIAL_EASE_FACTOR = 2.5

/**
 * Calculate next review state using SM-2 algorithm.
 * Returns updated state + next scheduled review date.
 */
export function calculateNextReview(
  current: SM2State,
  grade: ReviewGrade
): SM2Result {
  let { easeFactor, interval, repetitions } = current

  if (grade < 2) {
    // Failed — reset interval, keep ease factor with penalty
    repetitions = 0
    interval = 1
    easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor - 0.2)
  } else {
    // Passed — advance interval
    if (repetitions === 0) {
      interval = 1
    } else if (repetitions === 1) {
      interval = 6
    } else {
      interval = Math.round(interval * easeFactor)
    }

    // Adjust ease factor based on grade
    // grade=2 (Good): no change; grade=3 (Easy): boost; grade=1 (Hard): penalty
    const gradeDelta = 0.1 - (3 - grade) * (0.08 + (3 - grade) * 0.02)
    easeFactor = Math.max(MIN_EASE_FACTOR, easeFactor + gradeDelta)
    repetitions += 1
  }

  const nextReviewAt = new Date()
  nextReviewAt.setDate(nextReviewAt.getDate() + interval)
  nextReviewAt.setHours(0, 0, 0, 0) // Start of day

  return { easeFactor, interval, repetitions, nextReviewAt }
}

/**
 * Get initial SM-2 state for a new card.
 */
export function getInitialSM2State(): SM2State {
  return {
    easeFactor: INITIAL_EASE_FACTOR,
    interval: 1,
    repetitions: 0,
  }
}

/**
 * Check if a card is due for review today.
 */
export function isCardDue(nextReviewAt: Date): boolean {
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  return nextReviewAt <= today
}
