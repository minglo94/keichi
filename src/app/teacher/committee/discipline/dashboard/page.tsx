"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  BEHAVIOR_LABEL, BEHAVIOR_COLOR, type BehaviorTypeValue,
} from "@/lib/behavior-types"

type StudentRow = {
  className:   string
  studentName: string
  counts:      Record<string, number>
  total:       number
}

type ClassRow = {
  className: string
  counts:    Record<string, number>
  total:     number   // negative records
  students:  number
}

export default function DisciplineDashboardPage() {
  const [view,     setView]     = useState<"student" | "class">("student")
  const [order,    setOrder]    = useState<BehaviorTypeValue[]>([])
  const [classes,  setClasses]  = useState<string[]>([])
  const [students, setStudents] = useState<StudentRow[]>([])
  const [loading,  setLoading]  = useState(true)
  const [cls,      setCls]      = useState("")
  const [search,   setSearch]   = useState("")
  const [msg,      setMsg]      = useState<string | null>(null)
  const [busy,     setBusy]     = useState<string | null>(null)
  const [alertThreshold, setAlertThreshold] = useState<number | null>(null)

  function load() {
    setLoading(true)
    const qs = cls ? `?className=${encodeURIComponent(cls)}` : ""
    fetch(`/api/discipline/stats${qs}`)
      .then((r) => r.ok ? r.json() : { order: [], classes: [], students: [] })
      .then((d) => { setOrder(d.order ?? []); setClasses(d.classes ?? []); setStudents(d.students ?? []) })
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [cls]) // eslint-disable-line

  // Class alert threshold (for highlighting the by-class view).
  useEffect(() => {
    fetch("/api/discipline/thresholds")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.classAlert?.enabled) setAlertThreshold(d.classAlert.threshold) })
      .catch(() => {})
  }, [])

  async function emailStudent(r: StudentRow) {
    setBusy(`${r.className}|${r.studentName}`)
    const res = await fetch("/api/behavior-records/email-teacher", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ className: r.className, studentName: r.studentName }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    setMsg(res.ok ? `已電郵通知 ${r.className} 班主任跟進 ${r.studentName}` : `✗ ${data.error ?? "電郵發送失敗"}`)
    setTimeout(() => setMsg(null), 5000)
  }

  async function emailClass(className: string) {
    setBusy(`class|${className}`)
    const res = await fetch("/api/behavior-records/email-teacher", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ className }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    setMsg(res.ok ? `已電郵 ${className} 班主任班級概況` : `✗ ${data.error ?? "電郵發送失敗"}`)
    setTimeout(() => setMsg(null), 5000)
  }

  const filtered = students.filter((s) => !search || s.studentName.includes(search) || s.className.includes(search))

  // Aggregate students → per-class rows for the 班別 view.
  const classRows: ClassRow[] = (() => {
    const map = new Map<string, ClassRow>()
    for (const s of students) {
      if (!map.has(s.className)) map.set(s.className, { className: s.className, counts: {}, total: 0, students: 0 })
      const row = map.get(s.className)!
      row.students += 1
      for (const [t, n] of Object.entries(s.counts)) row.counts[t] = (row.counts[t] ?? 0) + n
      row.total += s.total
    }
    return Array.from(map.values())
      .filter((c) => !search || c.className.includes(search))
      .sort((a, b) => b.total - a.total)
  })()

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/teacher/committee/discipline" className="text-caption" style={{ color: "var(--color-ink-400)" }}>← 訓育</Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">行為儀表板</h1>
      </div>
      <p className="text-caption mb-4" style={{ color: "var(--color-ink-400)" }}>
        全校行為紀錄統計。可按學生或班別檢視，並一鍵電郵班主任跟進。
      </p>

      {/* View toggle */}
      <div className="flex gap-1 mb-4">
        {([{ k: "student", l: "按學生" }, { k: "class", l: "按班別" }] as const).map((v) => (
          <button key={v.k} onClick={() => setView(v.k)}
            className="text-caption px-3 py-1.5 rounded-input transition-colors"
            style={{ background: view === v.k ? "var(--color-accent)" : "var(--color-surface-2)", color: view === v.k ? "white" : "var(--color-ink-600)" }}>
            {v.l}
          </button>
        ))}
      </div>

      {msg && (
        <div className="mb-4 p-2.5 rounded-input text-caption"
          style={{ background: "var(--color-surface-2)", color: "var(--color-ink-700)" }}>{msg}</div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {view === "student" && (
          <select value={cls} onChange={(e) => setCls(e.target.value)}
            className="px-3 py-2 text-caption rounded-input border"
            style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-700)" }}>
            <option value="">全部班別</option>
            {classes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={view === "student" ? "搜尋學生 / 班別…" : "搜尋班別…"}
          className="px-3 py-2 text-caption rounded-input border outline-none flex-1 min-w-[160px]"
          style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }} />
      </div>

      {loading ? (
        <p className="text-body text-center py-12" style={{ color: "var(--color-ink-300)" }}>載入中…</p>
      ) : view === "student" ? (
        filtered.length === 0 ? (
          <div className="card p-8 text-center" style={{ color: "var(--color-ink-300)" }}><p className="text-body">暫無資料</p></div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-caption">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <th className="text-left font-semibold px-3 py-2" style={{ color: "var(--color-ink-700)" }}>班別</th>
                  <th className="text-left font-semibold px-3 py-2" style={{ color: "var(--color-ink-700)" }}>學生</th>
                  {order.map((t) => <th key={t} className="text-center font-semibold px-2 py-2" style={{ color: BEHAVIOR_COLOR[t] }}>{BEHAVIOR_LABEL[t]}</th>)}
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={`${s.className}|${s.studentName}`} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td className="px-3 py-2" style={{ color: "var(--color-ink-500)" }}>{s.className}</td>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--color-ink-900)" }}>{s.studentName}</td>
                    {order.map((t) => {
                      const n = s.counts[t] ?? 0
                      return <td key={t} className="text-center px-2 py-2" style={{ color: n > 0 ? BEHAVIOR_COLOR[t] : "var(--color-ink-300)", fontWeight: n > 0 ? 600 : 400 }}>{n || "–"}</td>
                    })}
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => emailStudent(s)} disabled={busy === `${s.className}|${s.studentName}`}
                        className="text-caption px-2 py-1 rounded-input border whitespace-nowrap"
                        style={{ border: "1px solid var(--color-border)", color: "var(--color-accent)" }}>
                        {busy === `${s.className}|${s.studentName}` ? "…" : "✉ 班主任"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        classRows.length === 0 ? (
          <div className="card p-8 text-center" style={{ color: "var(--color-ink-300)" }}><p className="text-body">暫無資料</p></div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-caption">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                  <th className="text-left font-semibold px-3 py-2" style={{ color: "var(--color-ink-700)" }}>班別</th>
                  {order.map((t) => <th key={t} className="text-center font-semibold px-2 py-2" style={{ color: BEHAVIOR_COLOR[t] }}>{BEHAVIOR_LABEL[t]}</th>)}
                  <th className="text-center font-semibold px-2 py-2" style={{ color: "var(--color-ink-700)" }}>違規總數</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {classRows.map((c) => {
                  const over = alertThreshold != null && c.total >= alertThreshold
                  return (
                    <tr key={c.className} style={{ borderBottom: "1px solid var(--color-border)", background: over ? "#dc262610" : undefined }}>
                      <td className="px-3 py-2 font-medium" style={{ color: over ? "var(--color-discipline)" : "var(--color-ink-900)" }}>
                        {c.className}
                        {over && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-pill" style={{ background: "var(--color-discipline)", color: "white" }}>警示</span>}
                        <span className="ml-2 text-[10px]" style={{ color: "var(--color-ink-400)" }}>{c.students} 名學生</span>
                      </td>
                      {order.map((t) => {
                        const n = c.counts[t] ?? 0
                        return <td key={t} className="text-center px-2 py-2" style={{ color: n > 0 ? BEHAVIOR_COLOR[t] : "var(--color-ink-300)", fontWeight: n > 0 ? 600 : 400 }}>{n || "–"}</td>
                      })}
                      <td className="text-center px-2 py-2 font-semibold" style={{ color: over ? "var(--color-discipline)" : "var(--color-ink-700)" }}>{c.total}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => emailClass(c.className)} disabled={busy === `class|${c.className}`}
                          className="text-caption px-2 py-1 rounded-input border whitespace-nowrap"
                          style={{ border: "1px solid var(--color-border)", color: "var(--color-accent)" }}>
                          {busy === `class|${c.className}` ? "…" : "✉ 班主任"}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
