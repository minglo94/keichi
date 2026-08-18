"use client"

import { useEffect, useState, Suspense } from "react"
import dynamic from "next/dynamic"

const GoogleCalendarSettings = dynamic(
  () => import("@/components/GoogleCalendarSettings"),
  { ssr: false, loading: () => null }
)

type AttendanceStatus = "PENDING" | "CONFIRMED" | "ATTENDED" | "ABSENT"
type CommitteeType    = "ADMIN" | "DISCIPLINE" | "IT" | "CURRICULUM" | "ECA" | "SCHOOL"

type Activity = {
  id:          string
  title:       string
  startTime:   string
  endTime:     string | null
  location:    string | null
  assignments: { status: AttendanceStatus }[]
}

type SchoolEvent = {
  id:          string
  title:       string
  startDate:   string
  endDate:     string | null
  description: string | null
  committee:   CommitteeType | null
}

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  PENDING:   "var(--color-ink-400)",
  CONFIRMED: "var(--color-accent)",
  ATTENDED:  "var(--color-curriculum)",
  ABSENT:    "var(--color-discipline)",
}

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  PENDING:   "待確認",
  CONFIRMED: "已確認",
  ATTENDED:  "出席",
  ABSENT:    "缺席",
}

const COMMITTEE_COLORS: Record<CommitteeType, string> = {
  ADMIN:      "var(--color-admin)",
  DISCIPLINE: "var(--color-discipline)",
  IT:         "var(--color-it)",
  CURRICULUM: "var(--color-curriculum)",
  ECA:        "var(--color-eca)",
  SCHOOL:     "var(--color-school)",
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function buildIcs(activities: Activity[], events: SchoolEvent[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ICHI EduPortal//Student//HK",
  ]
  for (const act of activities) {
    const dtStart = new Date(act.startTime).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"
    const dtEnd   = act.endTime
      ? new Date(act.endTime).toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z"
      : dtStart
    lines.push("BEGIN:VEVENT")
    lines.push(`UID:activity-${act.id}@ichi`)
    lines.push(`DTSTART:${dtStart}`)
    lines.push(`DTEND:${dtEnd}`)
    lines.push(`SUMMARY:${act.title}`)
    if (act.location) lines.push(`LOCATION:${act.location}`)
    lines.push("END:VEVENT")
  }
  for (const ev of events) {
    const dtStart = ev.startDate.slice(0, 10).replace(/-/g, "")
    const dtEnd   = ev.endDate ? ev.endDate.slice(0, 10).replace(/-/g, "") : dtStart
    lines.push("BEGIN:VEVENT")
    lines.push(`UID:school-event-${ev.id}@ichi`)
    lines.push(`DTSTART;VALUE=DATE:${dtStart}`)
    lines.push(`DTEND;VALUE=DATE:${dtEnd}`)
    lines.push(`SUMMARY:${ev.title}`)
    if (ev.description) lines.push(`DESCRIPTION:${ev.description.replace(/\n/g, "\\n")}`)
    lines.push("END:VEVENT")
  }
  lines.push("END:VCALENDAR")
  return lines.join("\r\n")
}

function isActivity(item: Activity | SchoolEvent): item is Activity {
  return "startTime" in item
}

export default function StudentCalendarPage() {
  const [activities,    setActivities]   = useState<Activity[]>([])
  const [schoolEvents,  setSchoolEvents] = useState<SchoolEvent[]>([])
  const [loading,       setLoading]      = useState(true)
  const [current,       setCurrent]      = useState(() => new Date())
  const [selected,      setSelected]     = useState<Activity | SchoolEvent | null>(null)
  const [overflowDay,   setOverflowDay]  = useState<string | null>(null)
  const [showGCalPanel, setShowGCalPanel] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch("/api/activities").then(r => r.ok ? r.json() : []),
      fetch("/api/calendar-events").then(r => r.ok ? r.json() : []),
    ])
      .then(([acts, evs]) => {
        setActivities(Array.isArray(acts) ? acts : [])
        setSchoolEvents(Array.isArray(evs) ? evs : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const year  = current.getFullYear()
  const month = current.getMonth()

  function prevMonth() { setCurrent(new Date(year, month - 1, 1)) }
  function nextMonth() { setCurrent(new Date(year, month + 1, 1)) }

  // Build 6×7 grid
  const firstDay = new Date(year, month, 1)
  const startDay = new Date(firstDay)
  startDay.setDate(startDay.getDate() - firstDay.getDay())

  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDay)
    d.setDate(startDay.getDate() + i)
    days.push(d)
  }

  const today = new Date()

  function itemsForDay(day: Date): (Activity | SchoolEvent)[] {
    const acts = activities.filter(a => isSameDay(new Date(a.startTime), day))
    const evs  = schoolEvents.filter(e => isSameDay(new Date(e.startDate), day))
    return [...evs, ...acts] // school events first
  }

  function exportIcs() {
    const ics  = buildIcs(activities, schoolEvents)
    const blob = new Blob([ics], { type: "text/calendar" })
    const a    = document.createElement("a")
    a.href     = URL.createObjectURL(blob)
    a.download = "my-calendar.ics"
    a.click()
  }

  const monthNames = ["一月","二月","三月","四月","五月","六月","七月","八月","九月","十月","十一月","十二月"]
  const dayNames   = ["日","一","二","三","四","五","六"]

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-h1">活動行事曆</h1>
          <p className="text-body mt-0.5" style={{ color: "var(--color-ink-500)" }}>
            你的指派活動及全校學校活動
          </p>
        </div>
        <div className="flex gap-2 flex-wrap shrink-0">
          <button
            onClick={() => setShowGCalPanel((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-input text-body border transition-colors"
            style={{
              border: "1px solid var(--color-border)",
              color: showGCalPanel ? "var(--color-accent)" : "var(--color-ink-700)",
              background: showGCalPanel ? "var(--color-accent-soft)" : "var(--color-surface)",
            }}
            title="Google Calendar 同步設定"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none">
              <rect width="24" height="24" rx="3" fill="#1a73e8"/>
              <rect x="3.5" y="5.5" width="17" height="15" rx="1" fill="white"/>
              <rect x="3.5" y="5.5" width="17" height="4.5" rx="1" fill="#1a73e8"/>
              <rect x="7" y="3.5" width="2" height="4" rx="1" fill="#1a73e8"/>
              <rect x="15" y="3.5" width="2" height="4" rx="1" fill="#1a73e8"/>
              <text x="12" y="18" textAnchor="middle" fontSize="6" fontWeight="bold" fill="#1a73e8">{new Date().getDate()}</text>
            </svg>
            <span className="hidden sm:inline">Google 同步</span>
          </button>
          <button
            onClick={exportIcs}
            className="px-4 py-2 rounded-input text-body border"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}
          >
            匯出 .ics
          </button>
        </div>
      </div>

      {/* Google Calendar settings panel */}
      {showGCalPanel && (
        <Suspense fallback={null}>
          <GoogleCalendarSettings />
        </Suspense>
      )}

      <div className="card overflow-hidden">
        {/* Month header */}
        <div
          className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-ink-700)" }}
          >
            ←
          </button>
          <h2 className="text-h2">{year}年 {monthNames[month]}</h2>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-ink-700)" }}
          >
            →
          </button>
        </div>

        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 border-b" style={{ borderColor: "var(--color-border)" }}>
          {dayNames.map((d) => (
            <div
              key={d}
              className="text-center py-2 text-caption font-medium"
              style={{ color: "var(--color-ink-500)" }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        {loading ? (
          <div className="p-8 text-center text-body" style={{ color: "var(--color-ink-300)" }}>載入中…</div>
        ) : (
          <div className="grid grid-cols-7">
            {days.map((day, idx) => {
              const inMonth  = day.getMonth() === month
              const isToday  = isSameDay(day, today)
              const allItems = itemsForDay(day)
              const dayIso   = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`

              return (
                <div
                  key={idx}
                  className="min-h-[80px] p-1.5 border-b border-r"
                  style={{
                    borderColor: "var(--color-border)",
                    background:  inMonth ? "var(--color-surface)" : "var(--color-surface-2)",
                  }}
                >
                  <div className="flex justify-center mb-1">
                    <span
                      className={`text-caption font-medium w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "text-white" : ""}`}
                      style={{
                        background: isToday ? "var(--color-accent)" : "transparent",
                        color:      isToday ? "white" : inMonth ? "var(--color-ink-900)" : "var(--color-ink-300)",
                      }}
                    >
                      {day.getDate()}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {allItems.slice(0, 2).map((item) => {
                      if (isActivity(item)) {
                        const status = item.assignments[0]?.status ?? "PENDING"
                        return (
                          <button
                            key={`act-${item.id}`}
                            onClick={() => setSelected(item)}
                            className="w-full text-left px-1 py-0.5 rounded text-caption truncate"
                            style={{
                              background: STATUS_COLORS[status] + "20",
                              color:      STATUS_COLORS[status],
                              fontSize:   "10px",
                            }}
                          >
                            {formatTime(item.startTime)} {item.title}
                          </button>
                        )
                      } else {
                        const color = item.committee ? COMMITTEE_COLORS[item.committee] : "var(--color-accent)"
                        return (
                          <button
                            key={`ev-${item.id}`}
                            onClick={() => setSelected(item)}
                            className="w-full text-left px-1 py-0.5 rounded text-caption truncate text-white"
                            style={{ background: color, fontSize: "10px" }}
                          >
                            {item.title}
                          </button>
                        )
                      }
                    })}
                    {allItems.length > 2 && (
                      <div
                        onClick={() => setOverflowDay(dayIso)}
                        className="text-[10px] px-1 py-0.5 rounded cursor-pointer"
                        style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
                      >
                        +{allItems.length - 2} 更多
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-x-5 gap-y-2 flex-wrap">
        <span className="text-caption font-medium" style={{ color: "var(--color-ink-500)" }}>出席狀態：</span>
        {(Object.entries(STATUS_LABELS) as [AttendanceStatus, string][]).map(([s, label]) => (
          <div key={s} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: STATUS_COLORS[s] }} />
            <span className="text-caption" style={{ color: "var(--color-ink-500)" }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Overflow day modal */}
      {overflowDay && (() => {
        const overflowItems = itemsForDay(new Date(overflowDay + "T00:00:00"))
        const [oy, om, od] = overflowDay.split("-").map(Number)
        const dateLabel = `${oy}年${om}月${od}日`
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
            onClick={() => setOverflowDay(null)}
          >
            <div
              className="card p-5 w-full max-w-sm space-y-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-h3">{dateLabel}</h3>
                <button
                  onClick={() => setOverflowDay(null)}
                  className="text-body w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--color-surface-2)]"
                  style={{ color: "var(--color-ink-400)" }}
                >
                  ✕
                </button>
              </div>
              <div className="space-y-2">
                {overflowItems.map((item) => {
                  if (isActivity(item)) {
                    const status = item.assignments[0]?.status ?? "PENDING"
                    return (
                      <button
                        key={`act-${item.id}`}
                        onClick={() => { setOverflowDay(null); setSelected(item) }}
                        className="w-full text-left flex items-center gap-2 p-2 rounded-input"
                        style={{ background: "var(--color-surface-2)" }}
                      >
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: STATUS_COLORS[status] }}
                        />
                        <span className="text-body flex-1 truncate" style={{ color: "var(--color-ink-900)" }}>
                          {formatTime(item.startTime)} {item.title}
                        </span>
                        <span
                          className="text-caption px-1.5 py-0.5 rounded shrink-0"
                          style={{ background: STATUS_COLORS[status] + "20", color: STATUS_COLORS[status], fontSize: "10px" }}
                        >
                          {STATUS_LABELS[status]}
                        </span>
                      </button>
                    )
                  } else {
                    const color = item.committee ? COMMITTEE_COLORS[item.committee] : "var(--color-accent)"
                    return (
                      <button
                        key={`ev-${item.id}`}
                        onClick={() => { setOverflowDay(null); setSelected(item) }}
                        className="w-full text-left flex items-center gap-2 p-2 rounded-input"
                        style={{ background: "var(--color-surface-2)" }}
                      >
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                        <span className="text-body flex-1 truncate" style={{ color: "var(--color-ink-900)" }}>{item.title}</span>
                        {item.committee && (
                          <span
                            className="text-caption px-1.5 py-0.5 rounded shrink-0 text-white"
                            style={{ background: color, fontSize: "10px" }}
                          >
                            {item.committee}
                          </span>
                        )}
                      </button>
                    )
                  }
                })}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Detail modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30"
          onClick={() => setSelected(null)}
        >
          <div
            className="card p-6 max-w-sm w-full space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-h3">{selected.title}</h3>
              <button
                onClick={() => setSelected(null)}
                className="text-body shrink-0"
                style={{ color: "var(--color-ink-400)" }}
              >
                ✕
              </button>
            </div>

            {isActivity(selected) ? (
              <>
                {(() => {
                  const status = selected.assignments[0]?.status ?? "PENDING"
                  return (
                    <span
                      className="text-caption font-medium px-2 py-0.5 rounded-pill inline-block"
                      style={{ background: STATUS_COLORS[status] + "20", color: STATUS_COLORS[status] }}
                    >
                      {STATUS_LABELS[status]}
                    </span>
                  )
                })()}
                <p className="text-body" style={{ color: "var(--color-ink-700)" }}>
                  📅 {new Date(selected.startTime).toLocaleDateString("zh-HK", {
                    year: "numeric", month: "long", day: "numeric",
                  })} {formatTime(selected.startTime)}
                  {selected.endTime && ` — ${formatTime(selected.endTime)}`}
                </p>
                {selected.location && (
                  <p className="text-body" style={{ color: "var(--color-ink-700)" }}>
                    📍 {selected.location}
                  </p>
                )}
              </>
            ) : (
              <>
                {selected.committee && (
                  <span
                    className="text-caption font-medium px-2 py-0.5 rounded-pill inline-block text-white"
                    style={{ background: COMMITTEE_COLORS[selected.committee] }}
                  >
                    {selected.committee}
                  </span>
                )}
                <p className="text-body" style={{ color: "var(--color-ink-700)" }}>
                  📅 {new Date(selected.startDate).toLocaleDateString("zh-HK", {
                    year: "numeric", month: "long", day: "numeric",
                  })}
                  {selected.endDate && ` — ${new Date(selected.endDate).toLocaleDateString("zh-HK", {
                    month: "long", day: "numeric",
                  })}`}
                </p>
                {selected.description && (
                  <p className="text-body" style={{ color: "var(--color-ink-700)" }}>
                    {selected.description}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
