"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

type AttendanceStatus = "PENDING" | "CONFIRMED" | "ATTENDED" | "ABSENT"

type Activity = {
  id:          string
  title:       string
  description: string | null
  startTime:   string
  endTime:     string | null
  location:    string | null
  assignments: { status: AttendanceStatus }[]
}

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  PENDING:   "待確認",
  CONFIRMED: "已確認",
  ATTENDED:  "出席",
  ABSENT:    "缺席",
}

const STATUS_COLORS: Record<AttendanceStatus, string> = {
  PENDING:   "var(--color-ink-400)",
  CONFIRMED: "var(--color-accent)",
  ATTENDED:  "var(--color-curriculum)",
  ABSENT:    "var(--color-discipline)",
}

type FilterTab = "upcoming" | "confirmed" | "past"

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`
}

export default function StudentActivitiesPage() {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState<FilterTab>("upcoming")

  useEffect(() => {
    fetch("/api/activities")
      .then((r) => r.ok ? r.json() : [])
      .then((data: Activity[]) => { setActivities(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const now = new Date()

  const filtered = activities.filter((act) => {
    const status = act.assignments[0]?.status ?? "PENDING"
    const isPast = new Date(act.startTime) < now
    if (tab === "upcoming")  return !isPast && status !== "ATTENDED" && status !== "ABSENT"
    if (tab === "confirmed") return status === "CONFIRMED" && !isPast
    if (tab === "past")      return isPast || status === "ATTENDED" || status === "ABSENT"
    return true
  })

  const tabStyle = (t: FilterTab) => ({
    color:       tab === t ? "var(--color-accent)"     : "var(--color-ink-500)",
    borderBottom: tab === t ? "2px solid var(--color-accent)" : "2px solid transparent",
    background: "none",
  })

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-h1">我的活動</h1>
        <p className="text-body mt-0.5" style={{ color: "var(--color-ink-500)" }}>
          老師指派的課外及課堂活動
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-6 border-b" style={{ borderColor: "var(--color-border)" }}>
        {([
          ["upcoming",  "即將到來"],
          ["confirmed", "已確認"],
          ["past",      "過去"],
        ] as [FilterTab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="text-body pb-2 transition-colors"
            style={tabStyle(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-body" style={{ color: "var(--color-ink-300)" }}>載入中…</div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center text-body" style={{ color: "var(--color-ink-300)" }}>
          {tab === "upcoming"  && "暫無即將到來的活動"}
          {tab === "confirmed" && "暫無已確認的活動"}
          {tab === "past"      && "暫無過去的活動記錄"}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((act) => {
            const status = act.assignments[0]?.status ?? "PENDING"
            return (
              <div key={act.id} className="card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-h3 mb-1">{act.title}</h3>
                    <div className="flex items-center gap-4 flex-wrap mt-1">
                      <p className="text-caption" style={{ color: "var(--color-ink-500)" }}>
                        📅 {formatDateTime(act.startTime)}
                        {act.endTime && ` — ${formatDateTime(act.endTime)}`}
                      </p>
                      {act.location && (
                        <p className="text-caption" style={{ color: "var(--color-ink-500)" }}>
                          📍 {act.location}
                        </p>
                      )}
                    </div>
                    {act.description && (
                      <p className="text-caption mt-2" style={{ color: "var(--color-ink-700)" }}>
                        {act.description}
                      </p>
                    )}
                  </div>
                  <span
                    className="text-caption font-medium px-2 py-0.5 rounded-pill shrink-0"
                    style={{
                      background: STATUS_COLORS[status] + "20",
                      color:      STATUS_COLORS[status],
                    }}
                  >
                    {STATUS_LABELS[status]}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
