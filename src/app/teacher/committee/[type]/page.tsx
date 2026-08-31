import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { CommitteeBadge } from "@/components/teacher/CommitteeBadge"
import { CommitteeToolsManager } from "@/components/teacher/CommitteeToolsManager"
import { PresetToolsGrid } from "@/components/teacher/PresetToolsGrid"
import Link from "next/link"
import { canSeeCommittee } from "@/lib/committee"

type Slug = "admin" | "discipline" | "it" | "curriculum" | "eca" | "student-support"
type CommitteeType = "ADMIN" | "DISCIPLINE" | "IT" | "CURRICULUM" | "ECA" | "STUDENT_SUPPORT"

export async function generateStaticParams() {
  return [
    { type: "admin" },
    { type: "discipline" },
    { type: "it" },
    { type: "curriculum" },
    { type: "eca" },
    { type: "student-support" },
  ]
}

const SLUG_TO_ENUM: Record<Slug, CommitteeType> = {
  admin:      "ADMIN",
  discipline: "DISCIPLINE",
  it:         "IT",
  curriculum: "CURRICULUM",
  eca:        "ECA",
  "student-support": "STUDENT_SUPPORT",
}

type CommitteeConfig = {
  label:       string
  description: string
  colorVar:    string
  tools: { label: string; description: string; href?: string }[]
  icon: React.ReactNode
}

const CONFIGS: Record<CommitteeType, CommitteeConfig> = {
  ADMIN: {
    label:       "行政委員",
    description: "管理學校日常行政事務，包括採購申請及活動文件管理。",
    colorVar:    "admin",
    tools: [
      { label: "宣佈訊息", description: "管理今日宣佈訊息、分類、AI 搜尋及匯入匯出", href: "/teacher/committee/admin/pa-announcements" },
      { label: "採購申請",   description: "填寫及追蹤採購申請表", href: "/teacher/committee/admin/procurement" },
      { label: "活動文件",   description: "一鍵生成通告、出席紀錄及 FAD8 學生學習紀錄 (ZIP)", href: "/teacher/committee/admin/activity-docs" },
      { label: "FAD8 年度彙編", description: "將全年已批核通告按學生整理成 FAD8 紀錄，可匯出 Excel", href: "/teacher/committee/admin/fad8" },
      { label: "教師進修", description: "登記及批核教師進修，自動對照時間表、假期及考試檢查衝突", href: "/teacher/committee/admin/pd" },
      { label: "共同空堂", description: "按科組、委員會或指定教師，搵大家都冇課嘅節次，方便約開會", href: "/teacher/committee/admin/free-slots" },
      { label: "KCquotation 報價", description: "填寫按口頭報價採購表格、生成 DOCX，支援 AI OCR 預填", href: "/teacher/committee/admin/quotation" },
      { label: "設施預約",   description: "電腦室、特別室及禮堂預約", href: "/teacher/committee/admin/booking" },
      { label: "費用結算",   description: "班費及活動費用記錄"   },
    ],
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-admin)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    ),
  },
  DISCIPLINE: {
    label:       "訓育委員",
    description: "記錄及跟進學生行為事項，維持校內紀律。",
    colorVar:    "discipline",
    tools: [
      { label: "行為記錄",   description: "記錄優點、缺點、小過、大過、遲到、缺席", href: "/teacher/committee/discipline/behavior" },
      { label: "行為儀表板", description: "按學生統計行為表現、電郵班主任", href: "/teacher/committee/discipline/dashboard" },
      { label: "行為預警",   description: "本月需留意的學生，與上月比較及早發現轉差個案", href: "/teacher/committee/discipline/early-warning" },
      { label: "訓育設定",   description: "班主任電郵及自動提示門檻", href: "/teacher/committee/discipline/settings" },
    ],
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-discipline)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  IT: {
    label:       "資訊委員",
    description: "提供資訊科技工具支援，協助課堂互動活動。",
    colorVar:    "it",
    tools: [
      { label: "QR Code 生成器", description: "快速生成 QR Code 供課堂使用", href: "/teacher/committee/it/qr-code"       },
      { label: "課堂計時器",     description: "計時器助你掌握課堂節奏",      href: "/teacher/committee/it/timer"          },
      { label: "隨機點名器",     description: "隨機抽選學生，支援記錄名單",   href: "/teacher/committee/it/random-picker"  },
      { label: "HEIC 轉 JPG",   description: "本地轉換 iPhone 相片格式",     href: "/teacher/committee/it/heic-convert"   },
      { label: "KCnotice 通知書", description: "從 DOCX 模板快速生成通知書", href: "/teacher/committee/it/notice-gen" },
      { label: "IT 設備管理",     description: "追蹤及管理校內 IT 設施",   href: "/teacher/committee/it/inventory" },
      { label: "圖片壓縮器",     description: "本地壓縮 JPG/PNG/WebP，不上傳伺服器",  href: "/teacher/committee/it/image-compress" },
      { label: "PDF 壓縮器",     description: "縮小 PDF 大小，方便電郵傳送",           href: "/teacher/committee/it/pdf-compress"   },
      { label: "OCR 文字提取",   description: "AI 識別圖片中的文字，支援繁體中文",      href: "/teacher/committee/it/ocr"            },
      { label: "AI 教學資源",    description: "老師共享的 YouTube 影片、工具及文章",     href: "/teacher/committee/it/ai-resources"   },
    ],
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-it)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  CURRICULUM: {
    label:       "課程委員",
    description: "協調課程規劃及教具管理，確保教學資源充足。",
    colorVar:    "curriculum",
    tools: [
      { label: "欠帶教具記錄", description: "追蹤學生欠帶教具情況" },
      { label: "課程文件",     description: "管理課程大綱及教案"   },
      { label: "教材申請",     description: "申請及登記教學材料"   },
    ],
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-curriculum)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  ECA: {
    label:       "課外活動委員",
    description: "策劃及管理課外活動、學會及聯課活動，豐富學生校園生活。",
    colorVar:    "eca",
    tools: [
      { label: "活動總覽",     description: "建立活動、今日／本週、按班別或學生查看出席", href: "/teacher/activities" },
      { label: "活動報名",     description: "管理課外活動及學會報名" },
      { label: "活動出席記錄", description: "記錄學生課外活動出席情況" },
      { label: "比賽及獎項",   description: "登記校外比賽及學生獎項"   },
    ],
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-eca)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="6" />
        <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
      </svg>
    ),
  },
  STUDENT_SUPPORT: {
    label:       "學生支援組",
    description: "支援有特殊學習或情緒需要的學生。此組別的行事曆只有組員及管理員可見。",
    colorVar:    "student-support",
    tools: [
      { label: "個案記錄",   description: "記錄及跟進個別學生支援情況" },
      { label: "支援計劃",   description: "制定及檢視學生支援計劃"   },
      { label: "轉介記錄",   description: "校內及校外專業轉介紀錄"   },
    ],
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-student-support)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    ),
  },
}

export default async function CommitteePage({ params }: { params: { type: string } }) {
  const slug = params.type as Slug
  const committeeType = SLUG_TO_ENUM[slug]
  if (!committeeType) notFound()

  const session = await auth()
  if (!session?.user) return null

  // 學生支援 is private: hiding the nav entry isn't enough, since the URL is
  // still guessable. 404 rather than 403 so the page's existence isn't confirmed.
  if (!(await canSeeCommittee(session.user.id, session.user.role, committeeType))) notFound()

  const config = CONFIGS[committeeType]

  // Fetch DB tools + todos + user's committee membership + favorited tools + hidden presets
  const [dbTools, todos, userRole, favorites, hidden] = await Promise.all([
    prisma.committeeTool.findMany({
      where: { committee: committeeType },
      orderBy: { order: "asc" },
    }),
    prisma.todo.findMany({
      where: {
        committee:   committeeType,
        createdById: session.user.id,
        status:      { not: "DONE" },
      },
      orderBy: [{ dueDate: "asc" }],
      take: 5,
    }),
    prisma.committeeRole.findFirst({
      where: {
        userId:    session.user.id,
        OR: [{ committee: committeeType }, { committee: "ADMIN" }],
      },
    }),
    prisma.toolFavorite.findMany({
      where:  { userId: session.user.id },
      select: { toolKey: true },
    }),
    prisma.committeeHiddenTool.findMany({
      where:  { committee: committeeType },
      select: { toolKey: true },
    }),
  ])

  const favoriteKeys = new Set(favorites.map((f) => f.toolKey))
  const hiddenKeys   = hidden.map((h) => h.toolKey)

  const canEditTools = session.user.role === "ADMIN" || (!!userRole && userRole.isChair)

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Committee header card */}
      <div
        className="card p-6"
        style={{ borderTop: `3px solid var(--color-${config.colorVar})` }}
      >
        <div className="flex items-start gap-4">
          <div
            className="w-14 h-14 rounded-[12px] flex items-center justify-center shrink-0"
            style={{ background: `var(--color-${config.colorVar}-soft)` }}
          >
            {config.icon}
          </div>
          <div>
            <h1 className="text-h1">{config.label}</h1>
            <p className="text-body mt-1" style={{ color: "var(--color-ink-500)" }}>
              {config.description}
            </p>
          </div>
        </div>
      </div>

      {/* DB-backed tools */}
      <div>
        <h2 className="text-h2 mb-4">工具</h2>
        <CommitteeToolsManager
          initialTools={dbTools.map((t) => ({
            id: t.id, label: t.label, description: t.description,
            type: t.type as "LINK" | "EMBED" | "HTML" | "GOOGLE_SHEET",
            content: t.content, order: t.order, active: t.active,
          }))}
          committee={committeeType}
          slug={slug}
          canEdit={canEditTools}
          colorVar={config.colorVar}
        />

        {/* Preset tools — deletable (hide/restore) by admin & committee chairs */}
        <PresetToolsGrid
          tools={config.tools}
          committee={committeeType}
          canEdit={canEditTools}
          colorVar={config.colorVar}
          favoriteKeys={Array.from(favoriteKeys)}
          hiddenKeys={hiddenKeys}
        />
      </div>

      {/* This committee's todos */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h2">本組待辦事項</h2>
          <Link
            href={`/teacher/todos?committee=${committeeType}`}
            className="text-caption font-medium"
            style={{ color: "var(--color-accent)" }}
          >
            查看全部 →
          </Link>
        </div>
        {todos.length === 0 ? (
          <div
            className="card p-6 text-center text-body"
            style={{ color: "var(--color-ink-300)" }}
          >
            暫無待辦事項
          </div>
        ) : (
          <ul className="space-y-2">
            {todos.map((todo) => (
              <li
                key={todo.id}
                className="card pl-4 pr-4 py-3 flex items-center gap-3"
                style={{ borderLeft: `3px solid var(--color-${config.colorVar})` }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>
                    {todo.title}
                  </p>
                  {todo.dueDate && (
                    <p className="text-caption" style={{ color: "var(--color-ink-500)" }}>
                      {new Date(todo.dueDate).getMonth()+1}月{new Date(todo.dueDate).getDate()}日
                    </p>
                  )}
                </div>
                <CommitteeBadge committee={committeeType} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
