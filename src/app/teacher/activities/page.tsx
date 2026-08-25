"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { StudentRosterInput, makeRow, type RosterRow } from "@/components/teacher/StudentRosterInput"

type Activity = {
  id:          string
  title:       string
  description: string | null
  startTime:   string
  endTime:     string | null
  location:    string | null
  committee:   string | null
  _count:      { assignments: number }
  assignments: { id: string }[]
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"]

export default function TeacherActivitiesPage() {
  const [activities, setActivities]   = useState<Activity[]>([])
  const [loading,    setLoading]      = useState(true)
  const [showForm,   setShowForm]     = useState(false)
  const [saving,     setSaving]       = useState(false)
  const [formError,  setFormError]    = useState<string | null>(null)

  // Filters
  const [searchQ,    setSearchQ]      = useState("")
  const [weekdayFilter, setWeekdayFilter] = useState<number | null>(null)
  const [sortBy,     setSortBy]       = useState<"date" | "students" | "title">("date")

  // Form state
  const [title,   setTitle]   = useState("")
  const [desc,    setDesc]    = useState("")
  const [start,   setStart]   = useState("")
  const [end,     setEnd]     = useState("")
  const [location, setLocation] = useState("")
  const [activityType, setActivityType] = useState<"" | "ECA" | "ACADEMIC">("")

  // Student roster (班級/學號/姓名 grid) + the accounts it resolved to.
  const [roster,       setRoster]       = useState<RosterRow[]>([makeRow(1)])
  const [resolvedIds,  setResolvedIds]  = useState<string[]>([])
  const [resolving,    setResolving]    = useState(false)
  const [matchSummary, setMatchSummary] = useState<{ matched: number; unmatched: number } | null>(null)

  // Match roster rows to student accounts so the teacher sees who was found
  // (and who wasn't) BEFORE saving, rather than losing rows silently.
  async function resolveRoster(): Promise<string[] | null> {
    setResolving(true)
    try {
      const res = await fetch("/api/students/resolve", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ rows: roster.map(({ id, className, studentId, name }) => ({ id, className, studentId, name })) }),
      })
      if (!res.ok) throw new Error()
      const { results } = await res.json() as {
        results: { id: number; matched: boolean; userId?: string; name?: string | null; email?: string | null }[]
      }
      const byId = new Map(results.map((r) => [r.id, r]))

      setRoster((prev) => prev.map((row) => {
        const hit = byId.get(row.id)
        if (!hit) return { ...row, status: undefined }
        return {
          ...row,
          status: hit.matched
            ? { ok: true,  label: hit.email ?? hit.name ?? "已配對" }
            : { ok: false, label: "找不到" },
        }
      }))

      const ids = results.filter((r) => r.matched && r.userId).map((r) => r.userId!)
      setResolvedIds(ids)
      // Only count rows the teacher actually filled in.
      const filled = roster.filter((r) => r.name.trim() || (r.className.trim() && r.studentId.trim())).length
      setMatchSummary({ matched: ids.length, unmatched: Math.max(0, filled - ids.length) })
      setResolving(false)
      return ids
    } catch {
      setFormError("配對失敗，請重試。")
      setResolving(false)
      return null
    }
  }

  function resetRoster() {
    setRoster([makeRow(1)]); setResolvedIds([]); setMatchSummary(null)
  }

  async function load() {
    setLoading(true)
    const res = await fetch("/api/activities")
    if (res.ok) setActivities(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function create(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormError(null)

    if (end && new Date(end) <= new Date(start)) {
      setFormError("截止時間不可早於或等於開始時間")
      setSaving(false)
      return
    }

    // If the teacher filled the roster but never pressed 配對, resolve now —
    // otherwise those students would be silently dropped on save.
    let ids = resolvedIds
    const filledRows = roster.filter((r) => r.name.trim() || (r.className.trim() && r.studentId.trim())).length
    if (filledRows > 0 && matchSummary === null) {
      const resolved = await resolveRoster()
      if (resolved === null) { setSaving(false); return }
      ids = resolved
    }

    try {
      const res = await fetch("/api/activities", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: desc || undefined,
          startTime:    new Date(start).toISOString(),
          endTime:      end ? new Date(end).toISOString() : undefined,
          location:     location || undefined,
          activityType: activityType || undefined,
          studentIds:   ids.length ? ids : undefined,
        }),
      })
      if (res.ok) {
        const created: Activity = await res.json()
        setActivities((prev) => [created, ...prev])
        setTitle(""); setDesc(""); setStart(""); setEnd(""); setLocation(""); setActivityType("")
        resetRoster()
        setShowForm(false)
      } else {
        const body = await res.json().catch(() => ({}))
        setFormError(body?.error ?? `建立失敗 (${res.status})，請重試`)
      }
    } catch {
      setFormError("網絡錯誤，請檢查連接後重試")
    } finally {
      setSaving(false)
    }
  }

  const inputCls   = "w-full px-3 py-2 text-body rounded-input border outline-none"
  const inputStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-h1">活動管理</h1>
          <p className="text-body mt-0.5" style={{ color: "var(--color-ink-500)" }}>為學生指派活動及管理出席</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/activities/export"
            className="text-caption px-3 py-2 rounded-input border"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-500)" }}
          >
            ⬇ 匯出 CSV
          </a>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="px-4 py-2 rounded-input text-body font-medium text-white"
            style={{ background: "var(--color-accent)" }}
          >
            + 新增活動
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={create} className="card p-5 mb-6 space-y-4">
          <h3 className="text-h3">新增活動</h3>
          <div>
            <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>活動名稱 *</label>
            <input required value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="活動名稱" className={inputCls} style={inputStyle} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>開始時間 *</label>
              <input required type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>結束時間（選填）</label>
              <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>活動類型（選填）</label>
              <select value={activityType} onChange={(e) => setActivityType(e.target.value as "" | "ECA" | "ACADEMIC")}
                className={inputCls} style={inputStyle}>
                <option value="">不指定</option>
                <option value="ECA">課外活動（星期一、二）</option>
                <option value="ACADEMIC">學科活動（星期三至五）</option>
              </select>
            </div>
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>地點（選填）</label>
              <input value={location} onChange={(e) => setLocation(e.target.value)}
                placeholder="課室、禮堂…" className={inputCls} style={inputStyle} />
            </div>
          </div>
          {(() => {
            if (!activityType || !start) return null
            const wd = new Date(start).getDay()
            const ok = activityType === "ECA" ? [1, 2].includes(wd) : [3, 4, 5].includes(wd)
            if (ok) return null
            return (
              <p className="text-caption px-3 py-2 rounded-input" style={{ background: "var(--color-admin-soft, #fff7ed)", color: "var(--color-admin, #b45309)" }}>
                ⚠ {activityType === "ECA" ? "課外活動建議於星期一、二舉辦" : "學科活動建議於星期三至五舉辦"}，你選的日期不在建議範圍內。
              </p>
            )
          })()}
          <div>
            <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>備注（選填）</label>
            <textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)}
              className={`${inputCls} resize-none`} style={inputStyle} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-caption font-medium" style={{ color: "var(--color-ink-700)" }}>學生名單（選填）</label>
              <button type="button" onClick={resolveRoster} disabled={resolving || roster.length === 0}
                className="text-caption font-medium" style={{ color: "var(--color-accent)", opacity: resolving || roster.length === 0 ? 0.5 : 1 }}>
                {resolving ? "配對中…" : "配對學生帳戶"}
              </button>
            </div>
            <StudentRosterInput
              rows={roster}
              onChange={setRoster}
              footnote="貼上後按「配對學生帳戶」，系統會以班級＋學號找出對應學生（連電郵），並在儲存時檢查時間衝突。"
            />
            {matchSummary && (
              <p className="text-caption mt-2" style={{ color: matchSummary.unmatched > 0 ? "var(--color-discipline)" : "var(--color-curriculum)" }}>
                已配對 {matchSummary.matched} 人
                {matchSummary.unmatched > 0 && ` · ${matchSummary.unmatched} 人找不到帳戶（將不會被加入）`}
              </p>
            )}
          </div>
          {formError && (
            <p className="text-caption px-3 py-2 rounded-input" style={{ background: "var(--color-discipline-soft, #fef2f2)", color: "var(--color-discipline, #dc2626)" }}>
              {formError}
            </p>
          )}
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 text-body rounded-input border"
              style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}>
              取消
            </button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-body font-medium rounded-input text-white"
              style={{ background: "var(--color-accent)", opacity: saving ? 0.7 : 1 }}>
              {saving ? "儲存中…" : "建立活動"}
            </button>
          </div>
        </form>
      )}

      {/* Filter bar */}
      {!loading && activities.length > 0 && (
        <div className="mb-4 space-y-3">
          {/* Search */}
          <input
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            placeholder="搜尋活動名稱或地點…"
            className="w-full px-3 py-2 text-body rounded-input border outline-none"
            style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }}
          />
          <div className="flex gap-2 flex-wrap items-center">
            {/* Weekday chips */}
            <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>星期：</span>
            {WEEKDAYS.map((d, i) => (
              <button
                key={i}
                onClick={() => setWeekdayFilter(weekdayFilter === i ? null : i)}
                className="text-caption px-2.5 py-1 rounded-full border transition-colors"
                style={{
                  background: weekdayFilter === i ? "var(--color-accent)" : "var(--color-surface)",
                  color:      weekdayFilter === i ? "#fff" : "var(--color-ink-700)",
                  borderColor: weekdayFilter === i ? "var(--color-accent)" : "var(--color-border)",
                }}
              >
                {d}
              </button>
            ))}
            {/* Sort */}
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>排序：</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "date" | "students" | "title")}
                className="text-caption px-2 py-1 rounded-input border"
                style={{ borderColor: "var(--color-border)", color: "var(--color-ink-700)", background: "var(--color-surface)" }}
              >
                <option value="date">日期</option>
                <option value="students">學生人數</option>
                <option value="title">名稱</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-body" style={{ color: "var(--color-ink-300)" }}>載入中…</div>
      ) : activities.length === 0 ? (
        <div className="text-center py-12 text-body" style={{ color: "var(--color-ink-300)" }}>尚未建立任何活動</div>
      ) : (() => {
        const filtered = activities
          .filter((a) => {
            const q = searchQ.toLowerCase()
            const matchQ = !q || a.title.toLowerCase().includes(q) || (a.location ?? "").toLowerCase().includes(q)
            const matchDay = weekdayFilter === null || new Date(a.startTime).getDay() === weekdayFilter
            return matchQ && matchDay
          })
          .sort((a, b) => {
            if (sortBy === "students") return b._count.assignments - a._count.assignments
            if (sortBy === "title") return a.title.localeCompare(b.title)
            return new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
          })
        return filtered.length === 0 ? (
          <div className="text-center py-12 text-body" style={{ color: "var(--color-ink-300)" }}>沒有符合的活動</div>
        ) : (
        <div className="space-y-3">
          {filtered.map((act) => (
            <Link
              key={act.id}
              href={`/teacher/activities/${act.id}`}
              className="card p-5 block hover:shadow-card-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="text-h3 mb-1">{act.title}</h3>
                  <div className="flex items-center gap-4 flex-wrap">
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
                </div>
                <div className="text-right shrink-0">
                  <p className="text-caption font-medium" style={{ color: "var(--color-accent)" }}>
                    {act._count.assignments} 名學生
                  </p>
                  <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>
                    {act.assignments.length} 已確認
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
        )
      })()}
    </div>
  )
}
