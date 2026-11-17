// Keep stable IDs in storage so the displayed subject names can be updated.
export const PROMPT_SCHOOL_SUBJECT_GROUPS = [
  {
    label: "初中及共通科目",
    options: [
      ["CHINESE", "中文"],
      ["ENGLISH", "英文"],
      ["MATHEMATICS", "數學"],
      ["VISUAL_ARTS", "視藝"],
      ["SCIENCE", "科學"],
      ["SCIENCE_BIOLOGY", "科學(生物)"],
      ["SCIENCE_PHYSICS", "科學(物理)"],
      ["SCIENCE_CHEMISTRY", "科學(化學)"],
      ["CITIZENSHIP_ECONOMICS_SOCIETY", "公民、經濟與社會"],
      ["CHINESE_HISTORY", "中國歷史"],
      ["HISTORY", "歷史"],
      ["GEOGRAPHY", "地理"],
      ["COMPUTER", "電腦"],
      ["RELIGION", "宗教"],
      ["DESIGN_TECHNOLOGY", "設計與科技"],
      ["HOME_ECONOMICS", "家政"],
      ["MUSIC", "音樂"],
      ["PHYSICAL_EDUCATION", "體育"],
      ["PUTONGHUA", "普通話"],
    ],
  },
  {
    label: "高中科目及學習經歷",
    options: [
      ["CITIZENSHIP_SOCIAL_DEVELOPMENT", "公民與社會發展"],
      ["ECONOMICS", "經濟"],
      ["BUSINESS_ACCOUNTING_FINANCE", "企業、會計與財務概論"],
      ["PHYSICS", "物理"],
      ["CHEMISTRY", "化學"],
      ["BIOLOGY", "生物"],
      ["ICT", "資訊及通訊科技"],
      ["TOURISM_HOSPITALITY", "旅遊與款待"],
      ["OTHER_LEARNING_EXPERIENCES", "其他學習經歷"],
    ],
  },
] as const

type SchoolSubjectGroup = (typeof PROMPT_SCHOOL_SUBJECT_GROUPS)[number]
export type PromptSchoolSubject = SchoolSubjectGroup["options"][number][0]

const SCHOOL_SUBJECT_LABELS = new Map<string, string>()
for (const group of PROMPT_SCHOOL_SUBJECT_GROUPS) {
  for (const [id, label] of group.options) SCHOOL_SUBJECT_LABELS.set(id, label)
}

export function isPromptSchoolSubject(value: unknown): value is PromptSchoolSubject {
  return typeof value === "string" && SCHOOL_SUBJECT_LABELS.has(value)
}

export function getPromptSchoolSubjectLabel(value: string | null): string | undefined {
  return value === null ? undefined : SCHOOL_SUBJECT_LABELS.get(value)
}
