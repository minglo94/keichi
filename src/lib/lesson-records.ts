// 課堂紀錄 labels and quick-pick tags. Client-safe (no Prisma import), mirroring
// src/lib/behavior-types.ts so the two record kinds look and read alike.

export const RECORD_KINDS = ["ABSENT", "LATE", "MISSING_BOOK", "MISSING_HOMEWORK", "HOMEWORK_ABSENT", "PERFORMANCE"] as const
export type LessonRecordKindValue = (typeof RECORD_KINDS)[number]

export const RECORD_LABEL: Record<LessonRecordKindValue, string> = {
  ABSENT:           "缺席",
  LATE:             "遲到",
  MISSING_BOOK:     "欠帶書本",
  MISSING_HOMEWORK: "欠交功課",
  HOMEWORK_ABSENT:  "缺席未交",
  PERFORMANCE:      "課堂表現",
}

export const RECORD_COLOR: Record<LessonRecordKindValue, string> = {
  ABSENT:           "#b91c1c",
  LATE:             "#c2410c",
  MISSING_BOOK:     "#a16207",
  MISSING_HOMEWORK: "#7c3aed",
  HOMEWORK_ABSENT:  "#64748b",
  PERFORMANCE:      "#15803d",
}

/** Two-character badges. Explicit, because slicing the labels would show 「缺席」 for both 缺席 and 缺席未交. */
export const RECORD_SHORT: Record<LessonRecordKindValue, string> = {
  ABSENT: "缺席", LATE: "遲到", MISSING_BOOK: "欠書", MISSING_HOMEWORK: "欠交", HOMEWORK_ABSENT: "未交", PERFORMANCE: "表現",
}

/** The follow-up kinds — what the 回顧 table counts per student. */
export const FOLLOW_UP_KINDS: LessonRecordKindValue[] = ["MISSING_BOOK", "MISSING_HOMEWORK", "HOMEWORK_ABSENT", "ABSENT", "LATE"]

/** The two per-homework outcomes a student can have; 有交 is the absence of both. */
export const HOMEWORK_KINDS = ["MISSING_HOMEWORK", "HOMEWORK_ABSENT"] as const
export type HomeworkKind = (typeof HOMEWORK_KINDS)[number]

// One tap in a lesson; a teacher can still type their own.
export const PERFORMANCE_TAGS: { tag: string; points: number }[] = [
  { tag: "主動發問", points: 1 },
  { tag: "答得好",   points: 1 },
  { tag: "專注投入", points: 1 },
  { tag: "協助同學", points: 1 },
  { tag: "表現優異", points: 2 },
  { tag: "欠專注",   points: -1 },
  { tag: "騷擾課堂", points: -1 },
]

export const BOOK_TAGS = ["課本", "作業", "筆記", "工作紙", "文具"]

export function isNegativeRecord(kind: LessonRecordKindValue, points = 0): boolean {
  return kind === "PERFORMANCE" ? points < 0 : true
}

/** 「主動發問 ×2、答得好」 from a list of tags. */
export function summariseTags(tags: (string | null | undefined)[]): string {
  const counts = new Map<string, number>()
  for (const t of tags) if (t) counts.set(t, (counts.get(t) ?? 0) + 1)
  return Array.from(counts.entries()).map(([t, n]) => (n > 1 ? `${t} ×${n}` : t)).join("、")
}
