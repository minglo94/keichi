"use client"

import { PAAnnouncement, todayKey, dayKey, isThisWeek } from "./paTypes"

export type PAView = "today" | "week" | "month" | "all"

const TILES: { key: PAView; label: string; color: string }[] = [
  { key: "today", label: "今日",   color: "var(--color-accent)"     },
  { key: "week",  label: "本週",   color: "var(--color-it)"         },
  { key: "all",   label: "全部",   color: "var(--color-curriculum)" },
]

export function StatsRow({
  announcements,
  active,
  onSelect,
}: {
  announcements: PAAnnouncement[]
  active: PAView
  onSelect: (v: PAView) => void
}) {
  const today = todayKey()
  const counts = {
    today: announcements.filter((a) => dayKey(a.publishAt) === today).length,
    week:  announcements.filter((a) => isThisWeek(a.publishAt)).length,
    all:   announcements.length,
  }
  const urgent = announcements.filter((a) => a.priority === "URGENT").length

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {TILES.map((t) => (
        <button
          key={t.key}
          onClick={() => onSelect(t.key)}
          className="card p-4 text-left transition-transform hover:-translate-y-0.5"
          style={{ borderTop: `3px solid ${t.color}`, outline: active === t.key ? `2px solid ${t.color}` : "none" }}
        >
          <div className="text-h1" style={{ color: t.color }}>{counts[t.key as "today" | "week" | "all"]}</div>
          <div className="text-caption" style={{ color: "var(--color-ink-500)" }}>{t.label}公告</div>
        </button>
      ))}
      <div className="card p-4" style={{ borderTop: "3px solid var(--color-discipline)" }}>
        <div className="text-h1" style={{ color: "var(--color-discipline)" }}>{urgent}</div>
        <div className="text-caption" style={{ color: "var(--color-ink-500)" }}>緊急公告</div>
      </div>
    </div>
  )
}
