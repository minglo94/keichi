type CommitteeType = "ADMIN" | "DISCIPLINE" | "IT" | "CURRICULUM" | "ECA"

const LABELS: Record<CommitteeType, string> = {
  ADMIN:      "行政",
  DISCIPLINE: "訓育",
  IT:         "資訊科技",
  CURRICULUM: "課程發展",
  ECA:        "課外活動",
}

const COLORS: Record<CommitteeType, { bg: string; text: string }> = {
  ADMIN:      { bg: "var(--color-admin-soft)",      text: "var(--color-admin)"      },
  DISCIPLINE: { bg: "var(--color-discipline-soft)", text: "var(--color-discipline)" },
  IT:         { bg: "var(--color-it-soft)",         text: "var(--color-it)"         },
  CURRICULUM: { bg: "var(--color-curriculum-soft)", text: "var(--color-curriculum)" },
  ECA:        { bg: "var(--color-eca-soft)",        text: "var(--color-eca)"        },
}

export function CommitteeBadge({ committee }: { committee: CommitteeType }) {
  const { bg, text } = COLORS[committee]
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-pill text-caption font-medium shrink-0"
      style={{ background: bg, color: text }}
    >
      {LABELS[committee]}
    </span>
  )
}
