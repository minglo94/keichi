// Pure constants for behavior categories — safe to import in client components
// (no prisma / server-only imports).

export type BehaviorTypeValue =
  | "MERIT" | "MISCONDUCT" | "DEMERIT" | "MINOR_FAULT" | "MAJOR_FAULT" | "LATE" | "ABSENT"

export const BEHAVIOR_LABEL: Record<BehaviorTypeValue, string> = {
  MERIT:       "優點",
  DEMERIT:     "缺點",
  MINOR_FAULT: "小過",
  MAJOR_FAULT: "大過",
  LATE:        "遲到",
  ABSENT:      "缺席",
  MISCONDUCT:  "違規",
}

// Hex colours so we can build soft backgrounds with `${color}20` consistently.
export const BEHAVIOR_COLOR: Record<BehaviorTypeValue, string> = {
  MERIT:       "#16a34a",
  DEMERIT:     "#d97706",
  MINOR_FAULT: "#ea580c",
  MAJOR_FAULT: "#dc2626",
  LATE:        "#2563eb",
  ABSENT:      "#7c3aed",
  MISCONDUCT:  "#6b7280",
}

// Categories shown in dashboards / selects (merit first).
export const BEHAVIOR_ORDER: BehaviorTypeValue[] = [
  "MERIT", "DEMERIT", "MINOR_FAULT", "MAJOR_FAULT", "LATE", "ABSENT", "MISCONDUCT",
]

// Negative categories that drive discipline notifications + thresholds.
export const NEGATIVE_TYPES: BehaviorTypeValue[] = [
  "DEMERIT", "MINOR_FAULT", "MAJOR_FAULT", "LATE", "ABSENT", "MISCONDUCT",
]

export function isNegativeType(type: BehaviorTypeValue): boolean {
  return type !== "MERIT"
}
