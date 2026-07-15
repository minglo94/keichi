import Link from "next/link"

type Committee = {
  slug:         string
  label:        string
  description:  string
  colorVar:     string
  quickActions: string[]
  icon:         React.ReactNode
}

const COMMITTEES: Committee[] = [
  {
    slug:         "admin",
    label:        "行政委員",
    description:  "採購申請、活動文件管理",
    colorVar:     "admin",
    quickActions: ["採購申請", "活動文件"],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-admin)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    ),
  },
  {
    slug:         "discipline",
    label:        "訓育委員",
    description:  "學生行為記錄管理",
    colorVar:     "discipline",
    quickActions: ["行為記錄", "警告記錄"],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-discipline)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
  {
    slug:         "it",
    label:        "資訊委員",
    description:  "QR 碼生成、課堂計時器、設備管理",
    colorVar:     "it",
    quickActions: ["QR 碼", "計時器", "設備管理"],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-it)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    slug:         "curriculum",
    label:        "課程委員",
    description:  "教具欠缺記錄、課程文件",
    colorVar:     "curriculum",
    quickActions: ["教具記錄", "課程文件"],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-curriculum)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </svg>
    ),
  },
  {
    slug:         "eca",
    label:        "課外活動委員",
    description:  "活動報名、出席記錄、比賽獎項",
    colorVar:     "eca",
    quickActions: ["活動報名", "出席記錄", "比賽獎項"],
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-eca)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="6" />
        <path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11" />
      </svg>
    ),
  },
]

export function CommitteeToolsGrid() {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-h2">委員會工具 · Tools</h2>
        <span className="text-caption" style={{ color: "var(--color-ink-500)" }}>
          see all →
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {COMMITTEES.map((c) => (
          <Link key={c.slug} href={`/teacher/committee/${c.slug}`}>
            <div
              className="card p-5 hover:shadow-card-md transition-shadow cursor-pointer h-full"
              style={{ borderTop: `3px solid var(--color-${c.colorVar})` }}
            >
              {/* Icon */}
              <div
                className="w-10 h-10 rounded-[10px] mb-3 flex items-center justify-center"
                style={{ background: `var(--color-${c.colorVar}-soft)` }}
              >
                {c.icon}
              </div>

              {/* Label */}
              <h3 className="text-h3 mb-1">{c.label}</h3>
              <p className="text-caption mb-3" style={{ color: "var(--color-ink-500)" }}>
                {c.description}
              </p>

              {/* Quick action chips */}
              <div className="flex flex-wrap gap-1.5">
                {c.quickActions.map((action) => (
                  <span
                    key={action}
                    className="text-caption px-2 py-0.5 rounded-pill"
                    style={{
                      background: `var(--color-${c.colorVar}-soft)`,
                      color:      `var(--color-${c.colorVar})`,
                    }}
                  >
                    {action}
                  </span>
                ))}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
