// ============================================================
// Tool Registry
// Stable catalogue of "starrable" static tools across committees.
// A tool's `key` is its href — also used as ToolFavorite.toolKey,
// so favorites survive even though the tool pages are hardcoded.
// (DB-backed CommitteeTool rows use their row id as toolKey instead.)
// ============================================================

export type ToolRegistryEntry = {
  key:       string // === href, the stable identifier
  href:      string
  label:     string
  committee: "ADMIN" | "DISCIPLINE" | "IT" | "CURRICULUM" | "ECA"
  colorVar:  string
}

export const TOOL_REGISTRY: ToolRegistryEntry[] = [
  // 行政
  { key: "/teacher/committee/admin/booking",        href: "/teacher/committee/admin/booking",        label: "設施預約",      committee: "ADMIN",      colorVar: "admin"      },
  // 訓育
  { key: "/teacher/committee/discipline/behavior",  href: "/teacher/committee/discipline/behavior",  label: "行為記錄",      committee: "DISCIPLINE", colorVar: "discipline" },
  // 資訊科技
  { key: "/teacher/committee/it/qr-code",           href: "/teacher/committee/it/qr-code",           label: "QR Code 生成器", committee: "IT", colorVar: "it" },
  { key: "/teacher/committee/it/timer",             href: "/teacher/committee/it/timer",             label: "課堂計時器",     committee: "IT", colorVar: "it" },
  { key: "/teacher/committee/it/random-picker",     href: "/teacher/committee/it/random-picker",     label: "隨機點名器",     committee: "IT", colorVar: "it" },
  { key: "/teacher/committee/it/heic-convert",      href: "/teacher/committee/it/heic-convert",      label: "HEIC 轉 JPG",   committee: "IT", colorVar: "it" },
  { key: "/teacher/committee/it/notice-gen",        href: "/teacher/committee/it/notice-gen",        label: "KCnotice 通知書", committee: "IT", colorVar: "it" },
  { key: "/teacher/committee/it/quotation",         href: "/teacher/committee/it/quotation",         label: "KCquotation 報價", committee: "ADMIN", colorVar: "admin" },
  { key: "/teacher/committee/it/inventory",         href: "/teacher/committee/it/inventory",         label: "IT 設備管理",    committee: "IT", colorVar: "it" },
  { key: "/teacher/committee/it/image-compress",    href: "/teacher/committee/it/image-compress",    label: "圖片壓縮器",     committee: "IT", colorVar: "it" },
  { key: "/teacher/committee/it/pdf-compress",      href: "/teacher/committee/it/pdf-compress",      label: "PDF 壓縮器",     committee: "IT", colorVar: "it" },
  { key: "/teacher/committee/it/ocr",               href: "/teacher/committee/it/ocr",               label: "OCR 文字提取",   committee: "IT", colorVar: "it" },
]

const BY_KEY: Record<string, ToolRegistryEntry> = Object.fromEntries(
  TOOL_REGISTRY.map((t) => [t.key, t])
)

export function getToolByKey(key: string): ToolRegistryEntry | undefined {
  return BY_KEY[key]
}

export function isRegisteredTool(key: string): boolean {
  return key in BY_KEY
}
