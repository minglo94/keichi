"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import type { RosterEntry } from "@/components/classroom/RosterPanel"
import { FOLLOW_UP_KINDS, RECORD_COLOR, RECORD_KINDS, RECORD_LABEL, type LessonRecordKindValue } from "@/lib/lesson-records"
import { BEHAVIOR_LABEL, BEHAVIOR_ORDER, type BehaviorTypeValue } from "@/lib/behavior-types"

// 回顧: look back over this class's records to decide who needs following up.
//
// 按學生 is the follow-up view — one row per student, a count per kind, every
// student listed (a clean row is information too). 按堂 shows what happened in
// each lesson, newest first, so the last lesson can be checked before this one.
//
// Escalating to a 訓育 record is a deliberate act: 轉為訓育紀錄 opens a pre-
// filled form; nothing is filed automatically.

type Rec = {
  id: string; kind: LessonRecordKindValue; date: string; period: number | null; subject: string | null
  tag: string | null; note: string | null; points: number; awardedAt: string | null
  resolved: boolean; studentId: string
  student: { id: string; name: string | null }
  session: { id: string; period: number; periodLabel: string | null; subject: string | null; seq: number; startedAt: string } | null
  homework: { title: string } | null
  author: { name: string | null } | null
}

const hkDate = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 10)
const todayHk = () => hkDate(new Date().toISOString())
const describe = (r: Rec) => [r.tag, r.homework?.title, r.note].filter(Boolean).join("　")

export function ReviewPanel({ classId, className, roster }: { classId: string; className: string; roster: RosterEntry[] }) {
  const [view, setView] = useState<"student" | "lesson">("student")
  const [from, setFrom] = useState("")
  const [to,   setTo]   = useState("")
  const [kind, setKind] = useState("")
  const [unresolved, setUnresolved] = useState(false)
  const [records, setRecords] = useState<Rec[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const [escalate, setEscalate] = useState<{ student: RosterEntry; rows: Rec[] } | null>(null)

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    if (from) p.set("from", from)
    if (to) p.set("to", to)
    if (kind) p.set("kind", kind)
    if (unresolved) p.set("unresolved", "1")
    return p.toString()
  }, [from, to, kind, unresolved])

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    const res = await fetch(`/api/classes/${classId}/records?${qs}`)
    const d = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) { setError(d?.error ?? `載入失敗 (${res.status})`); return }
    setRecords(d.records)
  }, [classId, qs])

  useEffect(() => { load() }, [load])

  async function toggleResolved(r: Rec) {
    const res = await fetch(`/api/lesson-records/${r.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ resolved: !r.resolved }),
    })
    if (res.ok) setRecords((rs) => rs.map((x) => x.id === r.id ? { ...x, resolved: !r.resolved } : x))
  }

  async function resolveAll(rows: Rec[]) {
    for (const r of rows.filter((x) => !x.resolved && x.kind !== "PERFORMANCE")) await toggleResolved(r)
  }

  const byStudent = useMemo(() => {
    const m = new Map<string, Rec[]>()
    for (const r of records) m.set(r.studentId, [...(m.get(r.studentId) ?? []), r])
    return m
  }, [records])

  const bySession = useMemo(() => {
    const m = new Map<string, { key: string; date: string; label: string; rows: Rec[] }>()
    for (const r of records) {
      const key = r.session?.id ?? `d-${hkDate(r.date)}`
      const label = r.session
        ? [r.session.periodLabel ?? (r.session.period ? `第${r.session.period}節` : "手動開啟"), r.session.subject].filter(Boolean).join(" · ")
        : ""
      const cur = m.get(key) ?? { key, date: hkDate(r.date), label, rows: [] }
      cur.rows.push(r)
      m.set(key, cur)
    }
    return Array.from(m.values())
  }, [records])

  const inputStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 p-1 rounded-input" style={{ background: "var(--color-surface-2)" }}>
          {([["student", "按學生"], ["lesson", "按堂"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)} className="px-3 py-1.5 text-caption font-medium rounded-input"
              style={{ background: view === v ? "var(--color-surface)" : "transparent", color: view === v ? "var(--color-ink-900)" : "var(--color-ink-500)" }}>
              {label}
            </button>
          ))}
        </div>
        <input type="date" value={from} max={to || todayHk()} onChange={(e) => setFrom(e.target.value)} className="text-caption px-2 py-1.5 rounded-input border" style={inputStyle} title="由（預設：本學年開始）" />
        <span className="text-caption">至</span>
        <input type="date" value={to} min={from} max={todayHk()} onChange={(e) => setTo(e.target.value)} className="text-caption px-2 py-1.5 rounded-input border" style={inputStyle} title="至（預設：今日）" />
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="text-caption px-2 py-1.5 rounded-input border" style={inputStyle}>
          <option value="">全部類別</option>
          {RECORD_KINDS.map((k) => <option key={k} value={k}>{RECORD_LABEL[k]}</option>)}
        </select>
        <label className="text-caption flex items-center gap-1">
          <input type="checkbox" checked={unresolved} onChange={(e) => setUnresolved(e.target.checked)} /> 只顯示未跟進
        </label>
        <a href={`/api/classes/${classId}/records/export?${qs}`} className="text-caption px-3 py-1.5 rounded-input border ml-auto" style={inputStyle}>
          ⬇ 匯出 CSV
        </a>
      </div>
      {!from && !to && <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>預設顯示本學年至今。</p>}
      {error && <p className="text-caption" style={{ color: "var(--color-discipline)" }}>⚠ {error}</p>}
      {loading && <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>載入中…</p>}

      {view === "student" ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-body">
            <thead>
              <tr className="text-caption" style={{ color: "var(--color-ink-500)", background: "var(--color-surface-2)" }}>
                <th className="text-left px-3 py-2">學生</th>
                {FOLLOW_UP_KINDS.map((k) => <th key={k} className="px-2 py-2" style={{ color: RECORD_COLOR[k] }}>{RECORD_LABEL[k]}</th>)}
                <th className="px-2 py-2" style={{ color: RECORD_COLOR.PERFORMANCE }}>表現淨分</th>
                <th className="px-2 py-2">未跟進</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((s) => {
                const rows = byStudent.get(s.id) ?? []
                const count = (k: LessonRecordKindValue) => rows.filter((r) => r.kind === k).length
                const net = rows.filter((r) => r.kind === "PERFORMANCE").reduce((n, r) => n + r.points, 0)
                const pendingFollow = rows.filter((r) => r.kind !== "PERFORMANCE" && !r.resolved)
                const isOpen = open === s.id
                return (
                  <Fragment key={s.id}>
                    <tr onClick={() => setOpen(isOpen ? null : s.id)} className="cursor-pointer border-t hover:bg-[var(--color-surface-2)]" style={{ borderColor: "var(--color-border)" }}>
                      <td className="px-3 py-2"><span className="text-caption tabular-nums mr-2" style={{ color: "var(--color-ink-400)" }}>{s.tag}</span>{s.name}</td>
                      {FOLLOW_UP_KINDS.map((k) => (
                        <td key={k} className="text-center tabular-nums" style={{ color: count(k) ? RECORD_COLOR[k] : "var(--color-ink-200)", fontWeight: count(k) >= 3 ? 700 : 400 }}>
                          {count(k) || "·"}
                        </td>
                      ))}
                      <td className="text-center tabular-nums" style={{ color: net > 0 ? RECORD_COLOR.PERFORMANCE : net < 0 ? RECORD_COLOR.ABSENT : "var(--color-ink-200)" }}>
                        {net ? `${net > 0 ? "+" : ""}${net}` : "·"}
                      </td>
                      <td className="text-center tabular-nums" style={{ color: pendingFollow.length ? "var(--color-admin)" : "var(--color-ink-200)" }}>{pendingFollow.length || "·"}</td>
                    </tr>
                    {isOpen && (
                      <tr><td colSpan={FOLLOW_UP_KINDS.length + 3} className="px-3 py-2" style={{ background: "var(--color-surface-2)" }}>
                        {rows.length === 0 ? <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>此期間沒有紀錄</p> : (
                          <>
                            <ul className="space-y-1">
                              {rows.map((r) => (
                                <li key={r.id} className="flex items-center gap-2 text-caption flex-wrap">
                                  <span className="tabular-nums" style={{ color: "var(--color-ink-400)" }}>{hkDate(r.date)}</span>
                                  <span style={{ color: RECORD_COLOR[r.kind] }}>{RECORD_LABEL[r.kind]}{r.kind === "PERFORMANCE" ? ` ${r.points > 0 ? "+" : ""}${r.points}` : ""}</span>
                                  <span style={{ color: "var(--color-ink-700)" }}>{describe(r)}</span>
                                  <span style={{ color: "var(--color-ink-300)" }}>{r.subject ?? ""} {r.author?.name ? `· ${r.author.name}` : ""}</span>
                                  {r.kind !== "PERFORMANCE" && (
                                    <button onClick={(e) => { e.stopPropagation(); toggleResolved(r) }} className="ml-auto px-2 py-0.5 rounded-pill border"
                                      style={{ border: "1px solid var(--color-border)", color: r.resolved ? "var(--color-curriculum)" : "var(--color-ink-500)" }}>
                                      {r.resolved ? "✓ 已跟進" : "標記已跟進"}
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                            <div className="flex gap-2 mt-2">
                              {pendingFollow.length > 1 && (
                                <button onClick={() => resolveAll(rows)} className="text-caption px-3 py-1 rounded-input border" style={{ border: "1px solid var(--color-border)" }}>
                                  全部標記已跟進
                                </button>
                              )}
                              {rows.some((r) => r.kind !== "PERFORMANCE") && (
                                <button onClick={() => setEscalate({ student: s, rows: rows.filter((r) => r.kind !== "PERFORMANCE") })}
                                  className="text-caption px-3 py-1 rounded-input border" style={{ border: "1px solid var(--color-border)", color: "var(--color-discipline)" }}>
                                  轉為訓育紀錄…
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </td></tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2">
          {bySession.length === 0 && !loading && <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>此期間沒有紀錄</p>}
          {bySession.map((g) => (
            <div key={g.key} className="card p-3">
              <p className="text-body font-medium">{g.date}{g.label ? `　${g.label}` : ""}</p>
              <ul className="mt-1 space-y-0.5">
                {g.rows.map((r) => (
                  <li key={r.id} className="text-caption flex gap-2 flex-wrap">
                    <span style={{ color: RECORD_COLOR[r.kind] }}>{RECORD_LABEL[r.kind]}{r.kind === "PERFORMANCE" ? ` ${r.points > 0 ? "+" : ""}${r.points}` : ""}</span>
                    <span>{r.student.name}</span>
                    <span style={{ color: "var(--color-ink-500)" }}>{describe(r)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {escalate && <EscalateModal className={className} entry={escalate} onClose={() => setEscalate(null)} />}
    </div>
  )
}

function EscalateModal({ className, entry, onClose }: {
  className: string
  entry: { student: RosterEntry; rows: Rec[] }
  onClose: () => void
}) {
  const { student, rows } = entry
  const counts = FOLLOW_UP_KINDS.map((k) => [k, rows.filter((r) => r.kind === k).length] as const).filter(([, n]) => n > 0)
  const defaultType: BehaviorTypeValue =
    counts.length === 1 && counts[0][0] === "ABSENT" ? "ABSENT"
    : counts.length === 1 && counts[0][0] === "LATE" ? "LATE" : "DEMERIT"

  const [type, setType] = useState<BehaviorTypeValue>(defaultType)
  const [description, setDescription] = useState(
    `課堂紀錄：${counts.map(([k, n]) => `${RECORD_LABEL[k]} ${n} 次`).join("、")}\n` +
    rows.slice(0, 10).map((r) => `- ${hkDate(r.date)} ${RECORD_LABEL[r.kind]} ${describe(r)}`.trim()).join("\n"),
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // 訓育 records are filed under the student's form class, which is how the
  // discipline committee looks them up.
  const formClass = student.formClass ?? className

  async function submit() {
    if (!student.name) { setErr("此學生未有姓名，未能建立訓育紀錄"); return }
    setBusy(true); setErr(null)
    const res = await fetch("/api/behavior-records", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: todayHk(), className: formClass, studentName: student.name, type, description }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setErr(d?.error ?? `建立失敗 (${res.status})`); return }
    setDone(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-card p-5 w-full max-w-lg space-y-3">
        <h3 className="text-h3">轉為訓育紀錄：{formClass} {student.name}</h3>
        {done ? (
          <>
            <p className="text-body" style={{ color: "var(--color-curriculum)" }}>✓ 已建立訓育紀錄，訓育組會收到通知。</p>
            <div className="flex justify-end"><button onClick={onClose} className="px-4 py-2 rounded-input border" style={{ border: "1px solid var(--color-border)" }}>關閉</button></div>
          </>
        ) : (
          <>
            <p className="text-caption" style={{ color: "var(--color-ink-500)" }}>
              會在「訓育 → 行為記錄」建立一筆紀錄，並按現有規則通知訓育組。請確認類別及內容。
            </p>
            <select value={type} onChange={(e) => setType(e.target.value as BehaviorTypeValue)} className="w-full px-3 py-2 text-body rounded-input border"
              style={{ border: "1px solid var(--color-border)" }}>
              {BEHAVIOR_ORDER.map((t) => <option key={t} value={t}>{BEHAVIOR_LABEL[t]}</option>)}
            </select>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={7}
              className="w-full px-3 py-2 text-body rounded-input border" style={{ border: "1px solid var(--color-border)" }} />
            {err && <p className="text-caption" style={{ color: "var(--color-discipline)" }}>⚠ {err}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-input border" style={{ border: "1px solid var(--color-border)" }}>取消</button>
              <button onClick={submit} disabled={busy || !description.trim()} className="px-4 py-2 rounded-input text-white"
                style={{ background: "var(--color-discipline)", opacity: busy ? 0.6 : 1 }}>{busy ? "建立中…" : "建立訓育紀錄"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
