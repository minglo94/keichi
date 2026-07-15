"use client"

import { useEffect, useState } from "react"

type Todo = { id: string; title: string; dueDate: string | null; status: string }

type CalendarEventMin = {
  id: string
  startDate: string
  title: string
  committee: "ADMIN" | "DISCIPLINE" | "IT" | "CURRICULUM" | "ECA" | null
}

const COMMITTEE_COLORS: Record<string, string> = {
  ADMIN:      "var(--color-admin)",
  DISCIPLINE: "var(--color-discipline)",
  IT:         "var(--color-it)",
  CURRICULUM: "var(--color-curriculum)",
  ECA:        "var(--color-eca)",
}

const COMMITTEE_LABELS: Record<string, string> = {
  ADMIN:      "行政",
  DISCIPLINE: "訓導",
  IT:         "電腦",
  CURRICULUM: "課程",
  ECA:        "課外活動",
}

const WEEK_DAYS = ["日", "一", "二", "三", "四", "五", "六"]
const MONTHS = ["一月","二月","三月","四月","五月","六月","七月","八月","九月","十月","十一月","十二月"]

function buildCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrev  = new Date(year, month, 0).getDate()

  const days: { date: number; currentMonth: boolean; iso: string }[] = []

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrev - i
    days.push({ date: d, currentMonth: false, iso: `${year}-${month.toString().padStart(2,"0")}-${d.toString().padStart(2,"0")}` })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ date: d, currentMonth: true, iso: `${year}-${(month+1).toString().padStart(2,"0")}-${d.toString().padStart(2,"0")}` })
  }
  const remaining = 42 - days.length
  for (let d = 1; d <= remaining; d++) {
    days.push({ date: d, currentMonth: false, iso: `${year}-${(month+2).toString().padStart(2,"0")}-${d.toString().padStart(2,"0")}` })
  }
  return days
}

function formatSelectedDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  return `${m}月${d}日（${WEEK_DAYS[new Date(y, m - 1, d).getDay()]}）`
}

export function MiniCalendar({ todos, calendarEvents = [] }: { todos: Todo[]; calendarEvents?: CalendarEventMin[] }) {
  const now = new Date()
  const [year,         setYear]         = useState(now.getFullYear())
  const [month,        setMonth]        = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [fetchedEvents, setFetchedEvents] = useState<CalendarEventMin[] | null>(null)

  // Re-fetch calendar events whenever the displayed month changes
  useEffect(() => {
    const ym = `${year}-${String(month + 1).padStart(2, "0")}`
    fetch(`/api/calendar-events?month=${ym}`)
      .then((r) => r.ok ? r.json() : [])
      .then((data: CalendarEventMin[]) => setFetchedEvents(data))
      .catch(() => {})
  }, [year, month])

  const activeEvents = fetchedEvents ?? calendarEvents

  const todoDates = new Set(
    todos
      .filter((t) => t.dueDate && t.status !== "DONE")
      .map((t) => t.dueDate!.slice(0, 10))
  )

  const todosByDate = todos.reduce<Record<string, Todo[]>>((acc, t) => {
    if (!t.dueDate || t.status === "DONE") return acc
    const iso = t.dueDate.slice(0, 10)
    if (!acc[iso]) acc[iso] = []
    acc[iso].push(t)
    return acc
  }, {})

  const eventsByDate = activeEvents.reduce<Record<string, CalendarEventMin[]>>((acc, ev) => {
    const iso = ev.startDate.slice(0, 10)
    if (!acc[iso]) acc[iso] = []
    acc[iso].push(ev)
    return acc
  }, {})

  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`

  function prev() {
    setSelectedDate(null)
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
  }
  function next() {
    setSelectedDate(null)
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
  }

  const days = buildCalendarDays(year, month)

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] ?? []) : []
  const selectedTodos  = selectedDate ? (todosByDate[selectedDate]  ?? []) : []
  const hasSelected    = selectedEvents.length > 0 || selectedTodos.length > 0

  return (
    <div className="card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-h3">
          {MONTHS[month]} · {year}
        </h3>
        <div className="flex items-center gap-1">
          <button
            onClick={prev}
            className="w-6 h-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-ink-500)" }}
            aria-label="上月"
          >
            ‹
          </button>
          <button
            onClick={next}
            className="w-6 h-6 flex items-center justify-center rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
            style={{ color: "var(--color-ink-500)" }}
            aria-label="下月"
          >
            ›
          </button>
        </div>
      </div>

      {/* Week day headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEK_DAYS.map((d) => (
          <div key={d} className="text-center text-caption" style={{ color: "var(--color-ink-300)" }}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {days.map((day, i) => {
          const isToday    = day.iso === todayStr && day.currentMonth
          const isSelected = day.iso === selectedDate && day.currentMonth
          const hasTodo    = todoDates.has(day.iso) && day.currentMonth
          const dayEvents  = day.currentMonth ? (eventsByDate[day.iso] ?? []) : []
          const eventColor = dayEvents[0]?.committee
            ? COMMITTEE_COLORS[dayEvents[0].committee]
            : dayEvents.length > 0 ? "var(--color-accent)" : null
          const hasContent = (hasTodo || dayEvents.length > 0) && day.currentMonth

          return (
            <div key={i} className="flex flex-col items-center">
              <button
                onClick={() => {
                  if (!day.currentMonth) return
                  setSelectedDate(selectedDate === day.iso ? null : day.iso)
                }}
                className={`w-7 h-7 flex items-center justify-center rounded-full text-body transition-colors ${
                  hasContent ? "cursor-pointer" : "cursor-default"
                }`}
                style={{
                  background: isToday
                    ? "var(--color-accent)"
                    : isSelected
                    ? "var(--color-accent-soft)"
                    : "transparent",
                  color: isToday
                    ? "white"
                    : isSelected
                    ? "var(--color-accent)"
                    : day.currentMonth
                    ? "var(--color-ink-900)"
                    : "var(--color-ink-200)",
                  fontWeight: isToday || isSelected ? 600 : undefined,
                  outline: "none",
                }}
              >
                {day.date}
              </button>
              <div className="flex gap-0.5 mt-0.5 h-1">
                {hasTodo && (
                  <div className="w-1 h-1 rounded-full" style={{ background: "var(--color-accent)" }} />
                )}
                {eventColor && (
                  <div className="w-1 h-1 rounded-full" style={{ background: eventColor }} />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Selected date panel */}
      {selectedDate && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px solid var(--color-border)" }}>
          <p className="text-caption font-medium mb-2" style={{ color: "var(--color-ink-500)" }}>
            {formatSelectedDate(selectedDate)}
          </p>

          {!hasSelected && (
            <p className="text-caption" style={{ color: "var(--color-ink-300)" }}>沒有活動</p>
          )}

          {selectedEvents.map((ev) => (
            <div key={ev.id} className="flex items-start gap-2 py-1">
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0 mt-1"
                style={{ background: ev.committee ? COMMITTEE_COLORS[ev.committee] : "var(--color-accent)" }}
              />
              <div className="min-w-0">
                <p className="text-caption leading-snug" style={{ color: "var(--color-ink-800)" }}>
                  {ev.title}
                </p>
                {ev.committee && (
                  <p className="text-[10px]" style={{ color: "var(--color-ink-400)" }}>
                    {COMMITTEE_LABELS[ev.committee] ?? ev.committee}
                  </p>
                )}
              </div>
            </div>
          ))}

          {selectedTodos.map((todo) => (
            <div key={todo.id} className="flex items-start gap-2 py-1">
              <div
                className="w-1.5 h-1.5 rounded-full shrink-0 mt-1"
                style={{ background: "var(--color-ink-400)" }}
              />
              <p className="text-caption leading-snug" style={{ color: "var(--color-ink-600)" }}>
                {todo.title}
                <span className="ml-1 text-[10px]" style={{ color: "var(--color-ink-300)" }}>待辦</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
