"use client"

import { useCallback, useEffect, useState } from "react"

// 收功課 — tap a student to cycle 有交 → 欠交 → 缺席 → 有交, the same rhythm as
// 點名. One list per homework, shared by the 課代表 collecting it and the
// teacher, so both always see the same thing whoever recorded each outcome.
//
// 缺席 means absent that day: they still owe it, but aren't counted as 欠交.

type Status = "SUBMITTED" | "MISSING" | "ABSENT"
type Outcome = { id: string; studentId: string; status: "MISSING" | "ABSENT"; resolved: boolean; recordedBy: string | null; byRep: boolean; mine: boolean }
type Student = { id: string; tag: string; name: string | null }

const LOOK: Record<Status, { label: string; bg: string; fg: string; border: string }> = {
  SUBMITTED: { label: "有交", bg: "var(--color-surface)", fg: "var(--color-ink-900)", border: "var(--color-border)" },
  MISSING:   { label: "欠交", bg: "#7c3aed", fg: "#fff", border: "#7c3aed" },
  ABSENT:    { label: "缺席", bg: "#e2e8f0", fg: "#334155", border: "#94a3b8" },
}
const NEXT: Record<Status, Status> = { SUBMITTED: "MISSING", MISSING: "ABSENT", ABSENT: "SUBMITTED" }

export function CollectSheet({
  classId, homeworkId, teacher, sessionId, onClose, onChanged,
}: {
  classId: string
  homeworkId: string
  /** Teachers may change anyone's outcome; a rep only their own, before follow-up. */
  teacher: boolean
  sessionId?: string | null
  onClose: () => void
  onChanged?: () => void
}) {
  const [title,    setTitle]    = useState("")
  const [roster,   setRoster]   = useState<Student[]>([])
  const [outcomes, setOutcomes] = useState<Outcome[]>([])
  const [busy,     setBusy]     = useState<string | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(true)

  const base = `/api/classes/${classId}/homework/${homeworkId}/misses`

  const load = useCallback(async () => {
    const res = await fetch(base)
    const d = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) { setError(d?.error ?? `載入失敗 (${res.status})`); return }
    setTitle([d.homework.subject, d.homework.title].filter(Boolean).join("：")); setRoster(d.roster); setOutcomes(d.outcomes)
  }, [base])

  useEffect(() => { load() }, [load])

  const byStudent = new Map(outcomes.map((o) => [o.studentId, o]))
  const statusOf = (id: string): Status => byStudent.get(id)?.status ?? "SUBMITTED"
  const lockedReason = (id: string) => {
    const o = byStudent.get(id)
    if (!o || teacher) return null
    if (o.resolved) return "老師已跟進"
    if (!o.mine) return `${o.recordedBy ?? "其他人"}記錄`
    return null
  }

  async function tap(s: Student) {
    if (busy) return
    const locked = lockedReason(s.id)
    if (locked) { setError(`${s.name ?? ""}：${locked}，只有老師可以更改`); return }
    setBusy(s.id); setError(null)
    const res = await fetch(base, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: s.id, status: NEXT[statusOf(s.id)], sessionId: sessionId ?? undefined }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setError(d?.error ?? `操作失敗 (${res.status})`); return }
    setOutcomes(d.outcomes)
    onChanged?.()
  }

  const missing = outcomes.filter((o) => o.status === "MISSING").length
  const absent  = outcomes.filter((o) => o.status === "ABSENT").length

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-card sm:rounded-card p-5 space-y-3">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <h3 className="text-h3">收功課：{title || "…"}</h3>
            <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>點同學切換：有交 → 欠交 → 缺席 → 有交</p>
          </div>
          <button onClick={onClose} className="px-3 py-1.5 rounded-input border text-caption" style={{ border: "1px solid var(--color-border)" }}>完成</button>
        </div>

        {!loading && (
          <p className="text-body flex gap-4 flex-wrap">
            <span>有交 <b>{roster.length - missing - absent}</b>／{roster.length}</span>
            <span style={{ color: LOOK.MISSING.bg }}>欠交 <b>{missing}</b></span>
            <span style={{ color: LOOK.ABSENT.fg }}>缺席 <b>{absent}</b></span>
          </p>
        )}
        {error && <p className="text-caption" style={{ color: "var(--color-discipline)" }}>⚠ {error}</p>}
        {loading && <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>載入中…</p>}

        <div className="grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(104px, 1fr))" }}>
          {roster.map((s) => {
            const st = statusOf(s.id)
            const look = LOOK[st]
            const locked = lockedReason(s.id)
            const o = byStudent.get(s.id)
            return (
              <button key={s.id} onClick={() => tap(s)} disabled={busy === s.id}
                className="rounded-input px-2 py-2 text-left"
                style={{
                  background: look.bg, color: look.fg, border: `1px solid ${look.border}`,
                  opacity: busy === s.id ? 0.6 : 1, touchAction: "manipulation",
                }}>
                <span className="block text-caption tabular-nums opacity-70">{s.tag || "—"}</span>
                <span className="block text-body font-medium truncate">{s.name ?? "—"}</span>
                <span className="block text-[10px] font-semibold" style={{ opacity: 0.9 }}>
                  {look.label}{o?.resolved ? " · 已跟進" : locked ? ` · ${locked}` : ""}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
