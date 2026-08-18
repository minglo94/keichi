"use client"

import { ReactNode } from "react"
import { PAAnnouncement, dayKey, todayKey, isThisWeek, isThisMonth } from "./paTypes"
import { PAView } from "./StatsRow"

function inView(a: PAAnnouncement, view: PAView): boolean {
  switch (view) {
    case "today": return dayKey(a.publishAt) === todayKey()
    case "week":  return isThisWeek(a.publishAt)
    case "month": return isThisMonth(a.publishAt)
    case "all":   return true
  }
}

function weekday(key: string): string {
  const [y, m, d] = key.split("-").map(Number)
  return ["日", "一", "二", "三", "四", "五", "六"][new Date(y, m - 1, d).getDay()]
}

// Groups the in-view announcements by HKT day (newest first) and renders each
// via `renderItem`. The page supplies the card so edit/delete/share stay there.
export function CalendarBoard({
  announcements,
  view,
  renderItem,
}: {
  announcements: PAAnnouncement[]
  view: PAView
  renderItem: (a: PAAnnouncement) => ReactNode
}) {
  const visible = announcements.filter((a) => inView(a, view))

  if (visible.length === 0) {
    return (
      <div className="card p-8 text-center text-body" style={{ color: "var(--color-ink-300)" }}>
        此範圍暫無公告
      </div>
    )
  }

  const groups = new Map<string, PAAnnouncement[]>()
  for (const a of visible) {
    const k = dayKey(a.publishAt)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(a)
  }
  const days = Array.from(groups.keys()).sort((a, b) => (a < b ? 1 : -1))

  return (
    <div className="space-y-6">
      {days.map((key) => (
        <div key={key}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-h3">{key.slice(5).replace("-", "月")}日</span>
            <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>星期{weekday(key)}</span>
            {key === todayKey() && (
              <span className="text-caption font-medium px-2 py-0.5 rounded-pill"
                style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
                今日
              </span>
            )}
          </div>
          <ul className="space-y-3">
            {groups.get(key)!.map((a) => <li key={a.id}>{renderItem(a)}</li>)}
          </ul>
        </div>
      ))}
    </div>
  )
}
