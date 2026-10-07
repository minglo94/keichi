"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { StudentRosterInput, makeRow, type RosterRow } from "@/components/teacher/StudentRosterInput"

// 名單 — add and remove students from this class or group. Only membership:
// names and class numbers are edited on 學生資料, so there is one place to fix
// a student's details, not two that drift apart.

export type RosterEntry = {
  id: string; name: string | null; nameEn: string | null
  classNumber: string | null; formClass: string | null; formNo: string | null; tag: string
}

type Hit = { id: string; name: string | null; email: string | null; enrollments: { classNumber: string | null; class: { id: string; name: string } }[] }

export function RosterPanel({
  classId, roster, onChanged,
}: {
  classId: string
  roster: RosterEntry[]
  /** Re-load the class after a change. */
  onChanged: () => void
}) {
  const [q,       setQ]       = useState("")
  const [hits,    setHits]    = useState<Hit[]>([])
  const [busy,    setBusy]    = useState(false)
  const [msg,     setMsg]     = useState<{ ok: boolean; text: string } | null>(null)
  const [paste,   setPaste]   = useState(false)
  const [rows,    setRows]    = useState<RosterRow[]>(() => Array.from({ length: 3 }, (_, i) => makeRow(i + 1)))
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const inRoster = new Set(roster.map((r) => r.id))

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    if (!q.trim()) { setHits([]); return }
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/students/search?q=${encodeURIComponent(q.trim())}&take=20`)
      setHits(res.ok ? await res.json() : [])
    }, 250)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [q])

  async function add(ids: string[]) {
    if (ids.length === 0) return
    setBusy(true); setMsg(null)
    const res = await fetch(`/api/classes/${classId}/members`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ids.length === 1 ? { userId: ids[0] } : { userIds: ids }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg({ ok: false, text: d?.error ?? `加入失敗 (${res.status})` }); return }
    setMsg({ ok: true, text: ids.length === 1 ? "已加入" : `已加入 ${d.added ?? ids.length} 人${d.skipped ? `，${d.skipped} 人已在名單` : ""}` })
    setQ(""); setHits([])
    onChanged()
  }

  async function remove(id: string, name: string | null) {
    if (!confirm(`從名單移除「${name ?? ""}」？\n（只是移出此班／組，不會刪除學生帳戶）`)) return
    const res = await fetch(`/api/classes/${classId}/members?userId=${id}`, { method: "DELETE" })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setMsg({ ok: false, text: d?.error ?? `移除失敗 (${res.status})` }); return
    }
    onChanged()
  }

  // Pasted rows resolve through the same matcher as 新增活動, so S4A / 4A / 01
  // all behave the same everywhere.
  async function importPasted() {
    const filled = rows.filter((r) => r.name.trim() || (r.className.trim() && r.studentId.trim()))
    if (filled.length === 0) return
    setBusy(true); setMsg(null)
    const res = await fetch("/api/students/resolve", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: filled.map(({ id, className, studentId, name }) => ({ id, className, studentId, name })) }),
    })
    setBusy(false)
    if (!res.ok) { setMsg({ ok: false, text: "配對失敗，請重試" }); return }
    const { results } = await res.json() as { results: { id: number; matched: boolean; userId?: string; reason?: string; name?: string | null }[] }
    const byId = new Map(results.map((r) => [r.id, r]))
    setRows((prev) => prev.map((row) => {
      const hit = byId.get(row.id)
      return hit ? { ...row, status: hit.matched ? { ok: true, label: hit.name ?? "已配對" } : { ok: false, label: hit.reason ?? "找不到" } } : row
    }))
    const ids = results.filter((r) => r.matched && r.userId).map((r) => r.userId!)
    const missed = results.filter((r) => !r.matched).length
    if (ids.length) await add(ids)
    if (missed) setMsg({ ok: false, text: `${missed} 行未能配對，請看「狀態」欄修正後再匯入` })
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋學生姓名或電郵，加入名單…"
              className="w-full px-3 py-2 text-body rounded-input border outline-none"
              style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }} />
            {hits.length > 0 && (
              <div className="absolute z-20 w-full mt-1 rounded-input shadow-card max-h-64 overflow-y-auto"
                style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}>
                {hits.map((h) => {
                  const cls = h.enrollments.map((e) => `${e.class.name}${e.classNumber ? ` (${e.classNumber})` : ""}`).join("、")
                  const already = inRoster.has(h.id)
                  return (
                    <button key={h.id} disabled={already || busy} onClick={() => add([h.id])}
                      className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-[var(--color-surface-2)]"
                      style={{ opacity: already ? 0.5 : 1 }}>
                      <span className="text-body" style={{ color: "var(--color-ink-900)" }}>{h.name ?? h.email}</span>
                      <span className="text-caption truncate" style={{ color: "var(--color-ink-400)" }}>{cls}</span>
                      <span className="text-caption ml-auto shrink-0" style={{ color: "var(--color-accent)" }}>{already ? "已在名單" : "＋ 加入"}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
          <button onClick={() => setPaste((p) => !p)} className="text-caption px-3 py-2 rounded-input border"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}>
            {paste ? "收起貼上" : "從 Excel 貼上名單"}
          </button>
        </div>

        {msg && <p className="text-caption" style={{ color: msg.ok ? "var(--color-curriculum)" : "var(--color-discipline)" }}>{msg.ok ? "✓" : "⚠"} {msg.text}</p>}

        {paste && (
          <div className="space-y-2">
            <StudentRosterInput rows={rows} onChange={setRows}
              footnote="會按班別＋學號（或姓名）配對現有學生帳戶；未有帳戶的學生請先到「學生資料」建立。" />
            <div className="flex justify-end">
              <button onClick={importPasted} disabled={busy} className="px-4 py-2 rounded-input text-body font-medium text-white"
                style={{ background: "var(--color-accent)", opacity: busy ? 0.6 : 1 }}>
                {busy ? "配對中…" : "配對並加入名單"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-2 flex items-center" style={{ borderBottom: "1px solid var(--color-border)" }}>
          <span className="text-body font-medium">名單（{roster.length} 人）</span>
          <Link href="/teacher/admin/students" className="text-caption ml-auto" style={{ color: "var(--color-ink-400)" }}>
            改學生姓名／學號 → 學生資料
          </Link>
        </div>
        {roster.length === 0 ? (
          <p className="p-6 text-center text-body" style={{ color: "var(--color-ink-300)" }}>名單未有學生，可以搜尋或從 Excel 貼上。</p>
        ) : (
          <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
            {roster.map((r) => (
              <li key={r.id} className="px-4 py-2 flex items-center gap-3">
                <span className="text-caption tabular-nums w-12 shrink-0" style={{ color: "var(--color-ink-400)" }}>{r.tag || "—"}</span>
                <span className="text-body" style={{ color: "var(--color-ink-900)" }}>{r.name ?? "—"}</span>
                <span className="text-caption truncate" style={{ color: "var(--color-ink-400)" }}>{r.nameEn}</span>
                <button onClick={() => remove(r.id, r.name)} className="text-caption ml-auto" style={{ color: "var(--color-discipline)" }}>
                  移出
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
