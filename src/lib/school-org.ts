// 科組 及 委員會 — the school's own lists, used by 教師資料 and anywhere else
// staff have to be tagged. Both are *suggestions*: the stored values are plain
// strings, so anything not on these lists can still be typed in by hand.

export const SUBJECTS = [
  "中文", "英文", "數學", "視藝", "科學",
  "科學(生物)", "科學(物理)", "科學(化學)",
  "公民、經濟與社會", "中國歷史", "歷史", "地理",
  "電腦", "宗教", "設計與科技", "家政", "音樂", "體育", "普通話",
] as const

// Transcribed from the school organisation chart. Grouped the same way the
// chart is, so the picker reads like the printed version.
export const COMMITTEE_GROUPS: { division: string; items: string[] }[] = [
  {
    division: "校本",
    items: [
      "教職員會議",
      "學校優化委員會",
      "校政委員會",
      "風險及危機處理委員會",
      "財務及資產管理委員會",
      "國安教育委員會",
    ],
  },
  {
    division: "I 管理與組織",
    items: [
      "家長教師會",
      "學校安全及健康委員會",
      "人力資源委員會",
      "總務委員會",
      "宗教委員會",
    ],
  },
  {
    division: "II 課程及學與教",
    items: [
      "專業發展及教育研究委員會",
      "學校自評及發展委員會",
      "教務及考評委員會",
      "課程發展與管理委員會",
      "典禮委員會",
      "STEAM教育委員會",
      "學習支援委員會",
    ],
  },
  {
    division: "III 學生成長及支援",
    items: [
      "社會服務委員會",
      "訓育委員會",
      "生涯規劃委員會",
      "輔導委員會",
      "課外活動委員會",
    ],
  },
  {
    division: "IV 校風及學生成就",
    items: [
      "國民教育委員會",
      "價值觀教育委員會",
      "跨課程語文學習委員會",
      "境外交流委員會",
      "學校推廣委員會",
      "學生獎勵委員會",
      "圖書館委員會",
      "數字教育委員會",
    ],
  },
]

// Deduped in case a committee is ever listed under two divisions.
export const COMMITTEES: string[] = Array.from(
  new Set(COMMITTEE_GROUPS.flatMap((g) => g.items)),
)

/**
 * Split a hand-typed or Excel-pasted cell into values.
 * Accepts 、 , ， ; ； / and newlines, so a teacher can type
 * 「中文、電腦」 or paste 「中文, 電腦」 and get the same result.
 */
export function splitTags(raw: string): string[] {
  return Array.from(new Set(
    raw.split(/[、,，;；\/\n\r]+/).map((s) => s.trim()).filter(Boolean),
  ))
}

/** The canonical way to show a stored list back in a single cell. */
export function joinTags(values: string[]): string {
  return values.join("、")
}
