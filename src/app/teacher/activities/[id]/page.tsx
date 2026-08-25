"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"

type AttendanceStatus = "PENDING" | "CONFIRMED" | "ATTENDED" | "ABSENT"

type Student = { 
  id: string; 
  name: string | null; 
  email: string | null; 
  image: string | null;
  enrollments?: {
    classNumber: string | null;
    class: { id: string; name: string }
  }[]
}

type Assignment = {
  activityId: string
  studentId:  string
  status:     AttendanceStatus
  alertSent:  boolean
  note:       string | null
  student:    Student
}

type ActivityType = "ECA" | "ACADEMIC"

type Activity = {
  id:          string
  title:       string
  description: string | null
  startTime:   string
  endTime:     string | null
  location:    string | null
  activityType: ActivityType | null
  assignments: Assignment[]
}

type DateSuggestion = { startTime: string; endTime: string | null; weekday: number }

const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = { ECA: "課外活動", ACADEMIC: "學科活動" }
const WEEKDAY_LABEL = ["日", "一", "二", "三", "四", "五", "六"]

type Clash = {
  studentId:   string
  studentName: string | null
  activity:    { id: string; title: string; startTime: string }
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

function formatDateTime(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`
}

function StudentSearch({ onAssign, existingIds }: {
  onAssign: (assigned: { studentId: string }[], clashes: Clash[]) => void
  existingIds: Set<string>
}) {
  const [query,   setQuery]   = useState("")
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([])
  const [classId, setClassId] = useState("")
  const [results, setResults] = useState<Student[]>([])
  const [selected, setSelected] = useState<Student[]>([])
  const [assigning, setAssigning] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch("/api/admin/classes").then(r => r.ok && r.json()).then(setClasses)
  }, [])

  const search = useCallback(async (q: string, cid: string) => {
    let url = "/api/admin/users?"
    if (q) url += `q=${encodeURIComponent(q)}&`
    if (cid) url += `classId=${cid}`
    
    // We'll update the /api/admin/users to support these filters or use a search endpoint
    // For now, let's assume we use the admin users list and filter client-side if q/cid is small
    const res  = await fetch("/api/admin/users")
    if (res.ok) {
      const data: any[] = await res.json()
      let filtered = data.filter(u => u.role === "STUDENT" && !existingIds.has(u.id) && !selected.some(s => s.id === u.id))
      
      if (cid) {
        filtered = filtered.filter(u => u.enrollments?.some((e: any) => e.class.id === cid))
      }
      if (q) {
        const lq = q.toLowerCase()
        filtered = filtered.filter(u => 
          u.name?.toLowerCase().includes(lq) || 
          u.email?.toLowerCase().includes(lq) ||
          u.enrollments?.some((e: any) => e.classNumber?.includes(lq))
        )
      }
      setResults(filtered)
    }
  }, [existingIds, selected])

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(query, classId), 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query, classId, search])

  const inputStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }

  return (
    <div className="space-y-3">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((s) => (
            <span key={s.id} className="flex items-center gap-1 px-2 py-0.5 rounded-pill text-caption"
              style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
              {s.name ?? s.email}
              <button type="button" onClick={() => setSelected((prev) => prev.filter((x) => x.id !== s.id))}>×</button>
            </span>
          ))}
          <button 
            onClick={() => setSelected([])}
            className="text-[10px] text-gray-400 hover:underline ml-1"
          >
            清除全部
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="w-full sm:w-40">
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="w-full px-3 py-2 text-caption rounded-input border outline-none h-[38px]"
            style={inputStyle}
          >
            <option value="">所有班別</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="relative flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋姓名或學號…"
            className="w-full px-3 py-2 text-body rounded-input border outline-none text-caption h-[38px]"
            style={inputStyle}
          />
          {results.length > 0 && (
            <div className="absolute z-10 w-full mt-1 rounded-input shadow-card overflow-hidden max-h-60 overflow-y-auto"
              style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
              {results.slice(0, 20).map((u) => (
                <button key={u.id} type="button"
                  onClick={() => { setSelected((prev) => [...prev, u]); setQuery(""); setResults([]) }}
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[var(--color-surface-2)] transition-colors">
                  <div>
                    <span className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>{u.name ?? u.email}</span>
                    <span className="text-[10px] text-gray-400 ml-2">{u.email}</span>
                  </div>
                  {u.enrollments?.[0] && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                      {u.enrollments[0].class.name} ({u.enrollments[0].classNumber ?? "--"})
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          disabled={selected.length === 0 || assigning}
          onClick={async () => {
            if (selected.length === 0) return
            setAssigning(true)
            const actId = window.location.pathname.split("/").pop()
            const res = await fetch(`/api/activities/${actId}/assign`, {
              method:  "POST",
              headers: { "Content-Type": "application/json" },
              body:    JSON.stringify({ studentIds: selected.map((s) => s.id) }),
            })
            if (res.ok) {
              const { assignedCount, clashes } = await res.json()
              onAssign([], clashes)
              setSelected([])
            }
            setAssigning(false)
          }}
          className="px-6 py-2 text-body rounded-input text-white shrink-0 h-[38px] font-medium"
          style={{ background: "var(--color-accent)", opacity: selected.length === 0 ? 0.5 : 1 }}
        >
          {assigning ? "指派中…" : "指派選擇"}
        </button>
      </div>
    </div>
  )
}

function BulkAssignModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: (count: number, clashes: Clash[]) => void }) {
  const [list, setList] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!list.trim() || busy) return
    setBusy(true)
    const actId = window.location.pathname.split("/").pop()
    const res = await fetch(`/api/activities/${actId}/assign`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ studentList: list }),
    })
    if (res.ok) {
      const data = await res.json()
      onSuccess(data.assignedCount, data.clashes)
    }
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <form onSubmit={submit} className="p-8 space-y-5">
          <div>
            <h3 className="text-xl font-bold text-gray-900">批量指派 (Excel 貼上)</h3>
            <p className="text-sm mt-1" style={{ color: "var(--color-ink-500)" }}>
              系統會自動根據班別、學號或姓名匹配學生。
            </p>
          </div>
          
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
            <p className="text-xs text-blue-700 font-medium mb-1">支援格式範例：</p>
            <ul className="text-[11px] text-blue-600 space-y-0.5 list-disc list-inside">
              <li>4A 15 陳大文 (班別 + 學號 + 姓名)</li>
              <li>4A 15 (班別 + 學號)</li>
              <li>陳大文 (姓名)</li>
              <li>chan.tai.man@school.hk (Email)</li>
            </ul>
          </div>

          <textarea
            required
            rows={10}
            value={list}
            onChange={(e) => setList(e.target.value)}
            className="w-full px-4 py-3 text-sm rounded-xl border outline-none font-mono focus:ring-2 focus:ring-blue-500 transition-all"
            style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }}
            placeholder="請直接從 Excel 複製列並在此貼上..."
          />

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} 
              className="flex-1 py-2.5 rounded-xl border text-sm font-medium hover:bg-gray-50 transition-colors">
              取消
            </button>
            <button type="submit" disabled={busy || !list.trim()} 
              className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold disabled:opacity-50 hover:opacity-90 transition-opacity"
              style={{ background: "var(--color-accent)" }}>
              {busy ? "正在匹配並指派…" : "確認並批量指派"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [activity,  setActivity]  = useState<Activity | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [clashes,   setClashes]   = useState<Clash[]>([])
  const [alerting,  setAlerting]  = useState(false)
  const [alertDone, setAlertDone] = useState(false)
  const [showBulk,  setShowBulk]  = useState(false)

  // Date suggestions (改期)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [suggestType, setSuggestType] = useState<ActivityType | "">("")
  const [suggestions, setSuggestions] = useState<DateSuggestion[] | null>(null)
  const [suggestLoading, setSuggestLoading] = useState(false)
  const [suggestMsg, setSuggestMsg] = useState<string | null>(null)
  const [rescheduling, setRescheduling] = useState<string | null>(null)

  async function load() {
    const res = await fetch(`/api/activities/${id}`)
    if (res.ok) setActivity(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [id]) // eslint-disable-line

  async function updateStatus(studentId: string, status: AttendanceStatus) {
    const res = await fetch(`/api/activities/${id}/assignments/${studentId}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ status }),
    })
    if (res.ok) {
      const updated: Assignment = await res.json()
      setActivity((prev) => prev ? {
        ...prev,
        assignments: prev.assignments.map((a) => a.studentId === studentId ? { ...a, ...updated } : a),
      } : prev)
    }
  }

  async function sendAlert() {
    setAlerting(true)
    const res = await fetch(`/api/activities/${id}/alert`, { method: "POST" })
    setAlerting(false)
    if (!res.ok) {
      // Don't show success for a send that reached nobody.
      const d = await res.json().catch(() => ({}))
      window.alert(d?.error ?? `發送失敗 (${res.status})`)
      return
    }
    const { alerted } = await res.json().catch(() => ({ alerted: 0 }))
    setAlertDone(true)
    window.alert(`已發送提醒給 ${alerted} 位學生。`)
  }

  function handleAssign(assigned: any, newClashes: Clash[]) {
    setClashes(newClashes)
    load()
    setShowBulk(false)
  }

  async function fetchSuggestions(typeOverride?: ActivityType) {
    setSuggestLoading(true)
    setSuggestMsg(null)
    setSuggestions(null)
    const qs = typeOverride ? `?type=${typeOverride}` : ""
    const res = await fetch(`/api/activities/${id}/suggest-dates${qs}`)
    setSuggestLoading(false)
    if (res.status === 400) {
      // Activity has no type set yet — ask the user to pick one.
      setSuggestMsg("請先選擇活動類型，系統會依「課外→星期一二／學科→星期三至五」建議日期。")
      return
    }
    if (!res.ok) { setSuggestMsg("暫時無法取得建議，請稍後再試。"); return }
    const data = await res.json()
    setSuggestions(data.suggestions ?? [])
    if ((data.suggestions ?? []).length === 0) {
      setSuggestMsg("未來 12 週內找不到「全部學生都有空」的合適日期，可嘗試調整名單或手動選日期。")
    }
  }

  function openSuggest() {
    setSuggestOpen(true)
    setSuggestions(null)
    setSuggestMsg(null)
    if (activity?.activityType) {
      setSuggestType(activity.activityType)
      fetchSuggestions()
    } else {
      setSuggestType("")
    }
  }

  async function rescheduleTo(s: DateSuggestion) {
    if (!activity) return
    setRescheduling(s.startTime)
    // 1) Move the activity to the suggested date (keep time-of-day).
    const patch = await fetch(`/api/activities/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ startTime: s.startTime, endTime: s.endTime }),
    })
    if (!patch.ok) {
      setRescheduling(null)
      setSuggestMsg("改期失敗（可能非活動建立者）。")
      return
    }
    // 2) Re-run clash detection for the existing roster at the new time.
    const studentIds = activity.assignments.map((a) => a.studentId)
    if (studentIds.length > 0) {
      const res = await fetch(`/api/activities/${id}/assign`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ studentIds }),
      })
      if (res.ok) {
        const data = await res.json()
        setClashes(data.clashes ?? [])
      }
    } else {
      setClashes([])
    }
    setRescheduling(null)
    setSuggestOpen(false)
    setSuggestions(null)
    load()
  }

  function formatSuggestion(s: DateSuggestion) {
    const d = new Date(s.startTime)
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    let out = `${d.getMonth() + 1}月${d.getDate()}日（星期${WEEKDAY_LABEL[s.weekday]}）${time}`
    if (s.endTime) {
      const e = new Date(s.endTime)
      out += `–${String(e.getHours()).padStart(2, "0")}:${String(e.getMinutes()).padStart(2, "0")}`
    }
    return out
  }

  if (loading) return <div className="p-6 text-center text-body" style={{ color: "var(--color-ink-300)" }}>載入中…</div>
  if (!activity) return <div className="p-6 text-center text-body" style={{ color: "var(--color-ink-300)" }}>找不到活動</div>

  const existingIds = new Set(activity.assignments.map((a) => a.studentId))

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link href="/teacher/activities" className="text-caption mb-2 inline-block"
          style={{ color: "var(--color-ink-400)" }}>← 活動管理</Link>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-h1">{activity.title}</h1>
          {activity.activityType && (
            <span className="text-caption px-2 py-0.5 rounded-pill"
              style={{ background: "var(--color-accent-soft, #eff6ff)", color: "var(--color-accent)" }}>
              {ACTIVITY_TYPE_LABEL[activity.activityType]}
            </span>
          )}
        </div>
        <div className="flex gap-4 mt-1 flex-wrap items-center">
          <p className="text-body" style={{ color: "var(--color-ink-500)" }}>
            📅 {formatDateTime(activity.startTime)}
            {activity.endTime && ` — ${formatDateTime(activity.endTime)}`}
          </p>
          {activity.location && (
            <p className="text-body" style={{ color: "var(--color-ink-500)" }}>📍 {activity.location}</p>
          )}
          <button onClick={openSuggest}
            className="text-caption px-3 py-1 rounded-input border"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-accent)" }}>
            🗓 建議改期
          </button>
        </div>
        {activity.description && (
          <p className="text-body mt-2" style={{ color: "var(--color-ink-700)" }}>{activity.description}</p>
        )}
      </div>

      {/* Clash warnings */}
      {clashes.length > 0 && (
        <div className="card p-4 space-y-2" style={{ borderLeft: "4px solid var(--color-admin)" }}>
          <p className="text-body font-medium" style={{ color: "var(--color-admin)" }}>
            ⚠ {clashes.length} 名學生時間衝突，已設為待確認：
          </p>
          {clashes.map((c, i) => (
            <p key={i} className="text-caption" style={{ color: "var(--color-ink-700)" }}>
              {c.studentName} — 與「{c.activity.title}」衝突
            </p>
          ))}
          <div className="flex gap-3 pt-1">
            <button onClick={openSuggest} className="text-caption font-medium px-3 py-1 rounded-input text-white"
              style={{ background: "var(--color-admin)" }}>
              🗓 建議其他日期
            </button>
            <button onClick={() => setClashes([])} className="text-caption" style={{ color: "var(--color-ink-400)" }}>關閉</button>
          </div>
        </div>
      )}

      {/* Date suggestion panel */}
      {suggestOpen && (
        <div className="card p-4 space-y-3" style={{ borderLeft: "4px solid var(--color-accent)" }}>
          <div className="flex items-center justify-between">
            <p className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>建議舉行日期</p>
            <button onClick={() => setSuggestOpen(false)} className="text-caption" style={{ color: "var(--color-ink-400)" }}>關閉</button>
          </div>

          {/* If the activity has no type, ask the teacher to pick one first. */}
          {!activity.activityType && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-caption" style={{ color: "var(--color-ink-500)" }}>活動類型：</span>
              {(["ECA", "ACADEMIC"] as ActivityType[]).map((t) => (
                <button key={t}
                  onClick={() => { setSuggestType(t); fetchSuggestions(t) }}
                  className="text-caption px-3 py-1 rounded-input border"
                  style={{
                    border: `1px solid ${suggestType === t ? "var(--color-accent)" : "var(--color-border)"}`,
                    color:  suggestType === t ? "var(--color-accent)" : "var(--color-ink-700)",
                  }}>
                  {ACTIVITY_TYPE_LABEL[t]}（星期{t === "ECA" ? "一、二" : "三至五"}）
                </button>
              ))}
            </div>
          )}

          {suggestLoading && <p className="text-caption" style={{ color: "var(--color-ink-300)" }}>計算中…</p>}
          {suggestMsg && <p className="text-caption" style={{ color: "var(--color-ink-500)" }}>{suggestMsg}</p>}

          {suggestions && suggestions.length > 0 && (
            <div className="space-y-2">
              <p className="text-caption" style={{ color: "var(--color-ink-500)" }}>
                以下日期全部學生都有空（保持原時間），撳一下即改期：
              </p>
              {suggestions.map((s) => (
                <div key={s.startTime} className="flex items-center justify-between gap-3 p-2 rounded-input"
                  style={{ background: "var(--color-surface-2)" }}>
                  <span className="text-body" style={{ color: "var(--color-ink-900)" }}>{formatSuggestion(s)}</span>
                  <button onClick={() => rescheduleTo(s)} disabled={rescheduling === s.startTime}
                    className="text-caption font-medium px-3 py-1 rounded-input text-white shrink-0"
                    style={{ background: "var(--color-accent)", opacity: rescheduling === s.startTime ? 0.6 : 1 }}>
                    {rescheduling === s.startTime ? "改期中…" : "改到此日期"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Student assignment */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-h2">指派學生</h2>
          <button 
            onClick={() => setShowBulk(true)}
            className="text-caption px-3 py-1.5 rounded-input border"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-accent)" }}
          >
            批量指派 (Excel)
          </button>
        </div>
        <StudentSearch onAssign={handleAssign} existingIds={existingIds} />
      </div>

      {/* Student attendance list */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-h2">出席名單 ({activity.assignments.length})</h2>
          <button
            onClick={sendAlert}
            disabled={alerting || alertDone}
            className="text-caption px-3 py-1.5 rounded-input text-white"
            style={{ background: alertDone ? "var(--color-curriculum)" : "var(--color-accent)", opacity: alerting ? 0.7 : 1 }}
          >
            {alertDone ? "✓ 提醒已發送" : alerting ? "發送中…" : "發送提醒"}
          </button>
        </div>

        {activity.assignments.length === 0 ? (
          <div className="card p-6 text-center text-body" style={{ color: "var(--color-ink-300)" }}>
            尚未指派學生
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <th className="text-left px-4 py-3 text-caption" style={{ color: "var(--color-ink-500)" }}>學生</th>
                  <th className="text-left px-4 py-3 text-caption" style={{ color: "var(--color-ink-500)" }}>狀態</th>
                  <th className="text-left px-4 py-3 text-caption" style={{ color: "var(--color-ink-500)" }}>備註</th>
                  <th className="px-4 py-3 text-caption" style={{ color: "var(--color-ink-500)" }}>更新</th>
                </tr>
              </thead>
              <tbody>
                {activity.assignments.map((a) => (
                  <tr key={a.studentId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td className="px-4 py-3">
                      <p className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>
                        {a.student.name ?? "—"}
                      </p>
                      <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>{a.student.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-caption font-medium px-2 py-0.5 rounded-pill"
                        style={{ background: STATUS_COLORS[a.status] + "20", color: STATUS_COLORS[a.status] }}>
                        {STATUS_LABELS[a.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-caption" style={{ color: a.status === "PENDING" ? "var(--color-discipline)" : "var(--color-ink-400)" }}>
                        {a.note ?? "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={a.status}
                        onChange={(e) => updateStatus(a.studentId, e.target.value as AttendanceStatus)}
                        className="text-caption px-2 py-1 rounded-input border outline-none"
                        style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}
                      >
                        {(["PENDING", "CONFIRMED", "ATTENDED", "ABSENT"] as AttendanceStatus[]).map((s) => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showBulk && (
        <BulkAssignModal 
          onClose={() => setShowBulk(false)} 
          onSuccess={handleAssign} 
        />
      )}
    </div>
  )
}
