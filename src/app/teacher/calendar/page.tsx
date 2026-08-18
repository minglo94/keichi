"use client"

import { useEffect, useRef, useState, Suspense } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"

const GoogleCalendarSettings = dynamic(
  () => import("@/components/GoogleCalendarSettings"),
  { ssr: false, loading: () => null }
)

type CommitteeType = "ADMIN" | "DISCIPLINE" | "IT" | "CURRICULUM" | "ECA" | "SCHOOL"

type CalendarEvent = {
  id:          string
  title:       string
  startDate:   string
  endDate:     string | null
  allDay:      boolean
  description: string | null
  committee:   CommitteeType | null
  authorId:    string
  author:      { id: string; name: string | null }
}

const COMMITTEE_COLORS: Record<CommitteeType, string> = {
  ADMIN:      "var(--color-admin)",
  DISCIPLINE: "var(--color-discipline)",
  IT:         "var(--color-it)",
  CURRICULUM: "var(--color-curriculum)",
  ECA:        "var(--color-eca)",
  SCHOOL:     "var(--color-school)",
}

const COMMITTEE_LABELS: Record<CommitteeType, string> = {
  ADMIN:      "行政",
  DISCIPLINE: "訓育",
  IT:         "資訊科技",
  CURRICULUM: "課程發展",
  ECA:        "課外活動",
  SCHOOL:     "學校活動及假期",
}

const DAYS = ["日", "一", "二", "三", "四", "五", "六"]
const MONTHS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"]

function buildDays(year: number, month: number) {
  const firstDay     = new Date(year, month, 1).getDay()
  const daysInMonth  = new Date(year, month + 1, 0).getDate()
  const daysInPrev   = new Date(year, month, 0).getDate()
  const cells: { date: number; current: boolean; iso: string }[] = []
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrev - i
    cells.push({ date: d, current: false, iso: "" })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    cells.push({ date: d, current: true, iso })
  }
  while (cells.length % 7 !== 0) cells.push({ date: 0, current: false, iso: "" })
  return cells
}

type IcsImportResult = { imported: number; skipped: number; errors: string[] }

function parseIcsDate(raw: string): string | null {
  // Handles DTSTART;VALUE=DATE:YYYYMMDD and DTSTART:YYYYMMDDTHHMMSSZ
  const digits = raw.replace(/[TZ]/g, "").replace(/-/g, "").slice(0, 8)
  if (digits.length !== 8) return null
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}

function parseIcs(text: string): { title: string; startDate: string; endDate?: string; description?: string }[] {
  const results: { title: string; startDate: string; endDate?: string; description?: string }[] = []
  // Split into VEVENT blocks
  const blocks = text.split("BEGIN:VEVENT").slice(1)
  for (const block of blocks) {
    const end = block.indexOf("END:VEVENT")
    const body = end >= 0 ? block.slice(0, end) : block

    // Unfold RFC 5545 line continuations (CRLF + whitespace)
    const unfolded = body.replace(/\r?\n[ \t]/g, "")
    const lines = unfolded.split(/\r?\n/)

    let title = ""
    let startDate = ""
    let endDate: string | undefined
    let description: string | undefined

    for (const line of lines) {
      const colonIdx = line.indexOf(":")
      if (colonIdx < 0) continue
      const key = line.slice(0, colonIdx).split(";")[0].toUpperCase()
      const val = line.slice(colonIdx + 1).trim()

      if (key === "SUMMARY") title = val.replace(/\\,/g, ",").replace(/\\n/g, " ")
      else if (key === "DTSTART") startDate = parseIcsDate(val) ?? ""
      else if (key === "DTEND") endDate = parseIcsDate(val) ?? undefined
      else if (key === "DESCRIPTION") description = val.replace(/\\n/g, "\n").replace(/\\,/g, ",") || undefined
    }

    if (title && startDate) results.push({ title, startDate, endDate, description })
  }
  return results
}

export default function CalendarPage() {
  const now = new Date()
  const [year,    setYear]    = useState(now.getFullYear())
  const [month,   setMonth]   = useState(now.getMonth())
  const [events,  setEvents]  = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)

  // Import state
  const icsInputRef  = useRef<HTMLInputElement>(null)
  const [importCommittee, setImportCommittee] = useState<CommitteeType | "">("")
  const [importing,    setImporting]    = useState(false)
  const [importResult, setImportResult] = useState<IcsImportResult | null>(null)

  // Modal state
  const [showGCalPanel, setShowGCalPanel] = useState(false)
  const [showCreate, setShowCreate]   = useState(false)
  const [selectedDay, setSelectedDay] = useState("")
  const [editEvent,   setEditEvent]   = useState<CalendarEvent | null>(null)

  // Overflow day popover state
  const [overflowDay, setOverflowDay] = useState<string | null>(null)

  // Form state
  const [formTitle,     setFormTitle]     = useState("")
  const [formStartDate, setFormStartDate] = useState("")
  const [formEndDate,   setFormEndDate]   = useState("")
  const [formCommittee, setFormCommittee] = useState<CommitteeType | "">("")
  const [formDesc,      setFormDesc]      = useState("")
  const [saving,        setSaving]        = useState(false)

  async function load() {
    setLoading(true)
    const m   = `${year}-${String(month + 1).padStart(2, "0")}`
    const res = await fetch(`/api/calendar-events?month=${m}`)
    if (res.ok) setEvents(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [year, month]) // eslint-disable-line

  function openCreate(iso?: string) {
    setFormTitle("")
    setFormStartDate(iso ?? "")
    setFormEndDate("")
    setFormCommittee("")
    setFormDesc("")
    setSelectedDay(iso ?? "")
    setEditEvent(null)
    setShowCreate(true)
  }

  function openEdit(event: CalendarEvent) {
    setFormTitle(event.title)
    setFormStartDate(event.startDate.slice(0, 10))
    setFormEndDate(event.endDate ? event.endDate.slice(0, 10) : "")
    setFormCommittee(event.committee ?? "")
    setFormDesc(event.description ?? "")
    setEditEvent(event)
    setShowCreate(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const body = {
      title:       formTitle,
      startDate:   formStartDate,
      endDate:     formEndDate || undefined,
      committee:   formCommittee || undefined,
      description: formDesc || undefined,
    }
    if (editEvent) {
      const res = await fetch(`/api/calendar-events/${editEvent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const updated: CalendarEvent = await res.json()
        setEvents((prev) => prev.map((ev) => ev.id === updated.id ? updated : ev))
      }
    } else {
      const res = await fetch("/api/calendar-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        const created: CalendarEvent = await res.json()
        setEvents((prev) => [...prev, created])
      }
    }
    setSaving(false)
    setShowCreate(false)
  }

  async function deleteEvent(id: string) {
    setEvents((prev) => prev.filter((ev) => ev.id !== id))
    await fetch(`/api/calendar-events/${id}`, { method: "DELETE" })
    setShowCreate(false)
  }

  async function handleIcsImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResult(null)

    const text = await file.text()
    const parsed = parseIcs(text)

    let imported = 0
    let skipped  = 0
    const errors: string[] = []

    for (const ev of parsed) {
      try {
        const res = await fetch("/api/calendar-events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title:       ev.title,
            startDate:   ev.startDate,
            endDate:     ev.endDate,
            description: ev.description,
            committee:   importCommittee || undefined,
          }),
        })
        if (res.ok) {
          const created: CalendarEvent = await res.json()
          // Only add to view if it falls in current month
          const evMonth = new Date(ev.startDate).getMonth()
          const evYear  = new Date(ev.startDate).getFullYear()
          if (evYear === year && evMonth === month) {
            setEvents((prev) => [...prev, created])
          }
          imported++
        } else {
          skipped++
        }
      } catch (_err) {
        errors.push(ev.title)
      }
    }

    setImportResult({ imported, skipped, errors })
    setImporting(false)
    if (icsInputRef.current) icsInputRef.current.value = ""

    window.alert(`åŒ¯å…¥å®Œæˆï¼
å·²æ–°å¢ž: ${imported}
å·²ç•¥éŽ: ${skipped}${errors.length > 0 ? `\néŒ¯èª¤: ${errors.join(", ")}` : ""}`)

    fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Calendar ICS Import",
        content: `Imported ${imported} events from ICS file. Skipped ${skipped}.`
      })
    }).catch(err => console.error("Logging failed:", err))
  }

  function exportIcs() {
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//ICHI EduPortal//HK",
    ]
    events.forEach((ev) => {
      const dtStart = ev.startDate.slice(0, 10).replace(/-/g, "")
      const dtEnd   = ev.endDate ? ev.endDate.slice(0, 10).replace(/-/g, "") : dtStart
      lines.push("BEGIN:VEVENT")
      lines.push(`UID:${ev.id}@ichi`)
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`)
      lines.push(`DTEND;VALUE=DATE:${dtEnd}`)
      lines.push(`SUMMARY:${ev.title}`)
      if (ev.description) lines.push(`DESCRIPTION:${ev.description.replace(/\n/g, "\\n")}`)
      lines.push("END:VEVENT")
    })
    lines.push("END:VCALENDAR")
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" })
    const a    = document.createElement("a")
    a.href     = URL.createObjectURL(blob)
    a.download = "ichi-calendar.ics"
    a.click()
  }

  function prevMonth() { if (month === 0) { setYear((y) => y - 1); setMonth(11) } else setMonth((m) => m - 1) }
  function nextMonth() { if (month === 11) { setYear((y) => y + 1); setMonth(0) } else setMonth((m) => m + 1) }

  const cells       = buildDays(year, month)
  const todayIso    = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"00")}`
  const eventsOnDay = (iso: string) => events.filter((ev) => ev.startDate.slice(0, 10) === iso)

  const inputCls   = "w-full px-3 py-2 text-body rounded-input border outline-none"
  const inputStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div>
          <h1 className="text-h1">全校行事曆</h1>
          <p className="text-body mt-0.5" style={{ color: "var(--color-ink-500)" }}>共 {events.length} 個活動</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-2 border rounded-input px-3" style={{ border: "1px solid var(--color-border)" }}>
            <span className="text-caption text-gray-500 whitespace-nowrap">匯入至:</span>
            <select
              value={importCommittee}
              onChange={(e) => setImportCommittee(e.target.value as CommitteeType | "")}
              className="bg-transparent text-caption py-1.5 outline-none font-medium"
              style={{ color: "var(--color-ink-700)" }}
            >
              <option value="">— 全校 —</option>
              <option value="ADMIN">行政</option>
              <option value="DISCIPLINE">訓育</option>
              <option value="IT">資訊科技</option>
              <option value="CURRICULUM">課程發展</option>
              <option value="ECA">課外活動</option>
              <option value="SCHOOL">學校活動及假期</option>
            </select>
            <button
              onClick={() => icsInputRef.current?.click()}
              disabled={importing}
              className="text-body font-medium transition-opacity pl-2 ml-2 border-l"
              style={{ borderLeft: "1px solid var(--color-border)", color: "var(--color-accent)", opacity: importing ? 0.5 : 1 }}
            >
              {importing ? "中…" : "匯入 .ics"}
            </button>
          </div>
          <input
            ref={icsInputRef}
            type="file"
            accept=".ics,.ical,text/calendar"
            className="hidden"
            onChange={handleIcsImport}
          />
          <button
            onClick={exportIcs}
            className="px-4 py-2 rounded-input text-body border"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}
          >
            匯出 .ics
          </button>
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
            {/* Google Calendar icon */}
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
            onClick={() => openCreate()}
            className="px-4 py-2 rounded-input text-body font-medium text-white"
            style={{ background: "var(--color-accent)" }}
          >
            + 新增活動
          </button>
        </div>
      </div>

      {/* Google Calendar settings panel — slides in under header */}
      {showGCalPanel && (
        <div className="mb-6">
          <Suspense fallback={null}>
            <GoogleCalendarSettings />
          </Suspense>
        </div>
      )}

      {/* Import result */}
      {importResult && (
        <div
          className="card p-4 mb-4"
          style={{ borderLeft: `4px solid ${importResult.errors.length > 0 ? "var(--color-discipline)" : "var(--color-accent)"}` }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1">
              <p className="text-body font-medium" style={{ color: "var(--color-curriculum)" }}>
                ✓ 已匯入 {importResult.imported} 個活動
              </p>
              {importResult.skipped > 0 && (
                <p className="text-body" style={{ color: "var(--color-admin)" }}>
                  ⚠ 已略過 {importResult.skipped} 個（重複或格式錯誤）
                </p>
              )}
              {importResult.errors.length > 0 && (
                <ul className="mt-1 space-y-0.5 list-disc list-inside">
                  {importResult.errors.slice(0, 5).map((err, i) => (
                    <li key={i} className="text-caption" style={{ color: "var(--color-discipline)" }}>
                      {err}
                    </li>
                  ))}
                  {importResult.errors.length > 5 && (
                    <li className="text-caption" style={{ color: "var(--color-ink-400)" }}>
                      …還有 {importResult.errors.length - 5} 個錯誤
                    </li>
                  )}
                </ul>
              )}
            </div>
            <button
              onClick={() => setImportResult(null)}
              className="text-body shrink-0 px-2"
              style={{ color: "var(--color-ink-400)" }}
            >
              × 關閉
            </button>
          </div>
        </div>
      )}

      {/* Month navigation */}
      <div className="flex items-center gap-4 mb-4">
        <button onClick={prevMonth} className="p-1.5 rounded-input border"
          style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}>‹</button>
        <h2 className="text-h2 min-w-[120px] text-center">{year}年 {MONTHS[month]}</h2>
        <button onClick={nextMonth} className="p-1.5 rounded-input border"
          style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}>›</button>
        <button onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}
          className="text-caption px-3 py-1.5 rounded-input border ml-2"
          style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-500)" }}>
          今天
        </button>
      </div>

      {/* Calendar grid */}
      <div className="card overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7" style={{ borderBottom: "1px solid var(--color-border)" }}>
          {DAYS.map((d) => (
            <div key={d} className="text-center py-2 text-caption font-medium"
              style={{ color: "var(--color-ink-400)" }}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        {loading ? (
          <div className="text-center py-12 text-body" style={{ color: "var(--color-ink-300)" }}>載入中…</div>
        ) : (
          <div className="grid grid-cols-7">
            {cells.map((cell, i) => {
              const dayEvents = cell.iso ? eventsOnDay(cell.iso) : []
              const isToday   = cell.iso === todayIso
              return (
                <div
                  key={i}
                  onClick={() => cell.iso && openCreate(cell.iso)}
                  className="min-h-[80px] p-1.5 cursor-pointer transition-colors hover:bg-[var(--color-surface-2)]"
                  style={{
                    borderRight:  (i + 1) % 7 === 0 ? "none" : `1px solid var(--color-border)`,
                    borderBottom: i < cells.length - 7 ? `1px solid var(--color-border)` : "none",
                    background:   cell.current ? "var(--color-surface)" : "var(--color-surface-2)",
                    opacity:      cell.current ? 1 : 0.4,
                  }}
                >
                  <div
                    className={`w-6 h-6 flex items-center justify-center rounded-full text-caption font-medium mb-1 ${isToday ? "text-white" : ""}`}
                    style={{
                      background: isToday ? "var(--color-accent)" : "transparent",
                      color:      isToday ? "white" : cell.current ? "var(--color-ink-900)" : "var(--color-ink-300)",
                    }}
                  >
                    {cell.date || ""}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        onClick={(e) => { e.stopPropagation(); openEdit(ev) }}
                        className="text-[10px] leading-tight px-1 py-0.5 rounded truncate cursor-pointer text-white"
                        style={{ background: ev.committee ? COMMITTEE_COLORS[ev.committee] : "var(--color-accent)" }}
                        title={ev.title}
                      >
                        {ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 2 && (
                      <div
                        onClick={(e) => { e.stopPropagation(); setOverflowDay(cell.iso) }}
                        className="text-[10px] px-1 py-0.5 rounded cursor-pointer"
                        style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
                      >
                        +{dayEvents.length - 2} 更多
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Overflow day modal */}
      {overflowDay && (() => {
        const overflowEvents = eventsOnDay(overflowDay)
        const [oy, om, od] = overflowDay.split("-").map(Number)
        const dateLabel = `${oy}年${om}月${od}日`
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/30" onClick={() => setOverflowDay(null)} />
            <div className="relative card p-5 w-full max-w-sm z-10 space-y-3">
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
                {overflowEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-center gap-2 p-2 rounded-input"
                    style={{ background: "var(--color-surface-2)" }}
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: ev.committee ? COMMITTEE_COLORS[ev.committee] : "var(--color-accent)" }}
                    />
                    <span className="text-body flex-1 truncate" style={{ color: "var(--color-ink-900)" }}>{ev.title}</span>
                    {ev.committee && (
                      <span
                        className="text-caption px-1.5 py-0.5 rounded shrink-0 text-white"
                        style={{ background: COMMITTEE_COLORS[ev.committee], fontSize: "10px" }}
                      >
                        {COMMITTEE_LABELS[ev.committee]}
                      </span>
                    )}
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => { setOverflowDay(null); openEdit(ev) }}
                        className="text-caption px-2 py-0.5 rounded"
                        style={{ color: "var(--color-accent)" }}
                      >
                        編輯
                      </button>
                      <button
                        onClick={() => deleteEvent(ev.id)}
                        className="text-caption px-2 py-0.5 rounded"
                        style={{ color: "var(--color-discipline)" }}
                      >
                        刪除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() => { setOverflowDay(null); openCreate(overflowDay) }}
                className="w-full py-2 text-body font-medium rounded-input text-white"
                style={{ background: "var(--color-accent)" }}
              >
                + 新增活動
              </button>
            </div>
          </div>
        )
      })()}

      {/* Create/Edit modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowCreate(false)} />
          <form
            onSubmit={save}
            className="relative card p-6 w-full max-w-md space-y-4 z-10"
          >
            <h3 className="text-h3">{editEvent ? "編輯活動" : "新增活動"}</h3>

            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>標題 *</label>
              <input required value={formTitle} onChange={(e) => setFormTitle(e.target.value)}
                placeholder="活動名稱" className={inputCls} style={inputStyle} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>開始日期 *</label>
                <input type="date" required value={formStartDate} onChange={(e) => setFormStartDate(e.target.value)}
                  className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>結束日期（選填）</label>
                <input type="date" value={formEndDate} onChange={(e) => setFormEndDate(e.target.value)}
                  className={inputCls} style={inputStyle} />
              </div>
            </div>

            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>所屬組別（選填）</label>
              <select value={formCommittee} onChange={(e) => setFormCommittee(e.target.value as CommitteeType | "")}
                className={inputCls} style={inputStyle}>
                <option value="">— 全校 —</option>
                <option value="ADMIN">行政</option>
                <option value="DISCIPLINE">訓育</option>
                <option value="IT">資訊科技</option>
                <option value="CURRICULUM">課程發展</option>
                <option value="ECA">課外活動</option>
                <option value="SCHOOL">學校活動及假期</option>
              </select>
            </div>

            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>備注（選填）</label>
              <textarea rows={2} value={formDesc} onChange={(e) => setFormDesc(e.target.value)}
                className={`${inputCls} resize-none`} style={inputStyle} />
            </div>

            <div className="flex gap-3 justify-between">
              {editEvent && (
                <button type="button" onClick={() => deleteEvent(editEvent.id)}
                  className="text-caption px-3 py-1.5 rounded-input"
                  style={{ color: "var(--color-discipline)" }}>
                  刪除
                </button>
              )}
              <div className="flex gap-3 ml-auto">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="px-4 py-2 text-body rounded-input border"
                  style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}>
                  取消
                </button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 text-body font-medium rounded-input text-white"
                  style={{ background: "var(--color-accent)", opacity: saving ? 0.7 : 1 }}>
                  {saving ? "儲存中…" : "儲存"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 flex-wrap mt-4">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: "var(--color-accent)" }} />
          <span className="text-caption" style={{ color: "var(--color-ink-500)" }}>全校</span>
        </div>
        {(Object.keys(COMMITTEE_COLORS) as CommitteeType[]).map((c) => (
          <div key={c} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: COMMITTEE_COLORS[c] }} />
            <span className="text-caption" style={{ color: "var(--color-ink-500)" }}>{COMMITTEE_LABELS[c]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
