"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { BEHAVIOR_LABEL, type BehaviorTypeValue } from "@/lib/behavior-types"

type Threshold = { category: BehaviorTypeValue; threshold: number; enabled: boolean }
type ClassAlert = { threshold: number; enabled: boolean }

export default function DisciplineSettingsPage() {
  const [rows,       setRows]       = useState<Threshold[]>([])
  const [classAlert, setClassAlert] = useState<ClassAlert>({ threshold: 20, enabled: false })
  const [loading,    setLoading]    = useState(true)
  const [saving,     setSaving]     = useState(false)
  const [saved,      setSaved]      = useState(false)

  useEffect(() => {
    fetch("/api/discipline/thresholds")
      .then((r) => r.ok ? r.json() : { thresholds: [], classAlert: { threshold: 20, enabled: false } })
      .then((d) => { setRows(d.thresholds ?? []); if (d.classAlert) setClassAlert(d.classAlert) })
      .finally(() => setLoading(false))
  }, [])

  function update(i: number, patch: Partial<Threshold>) {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  }

  async function save() {
    setSaving(true)
    const res = await fetch("/api/discipline/thresholds", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ thresholds: rows, classAlert }),
    })
    setSaving(false)
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500) }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/teacher/committee/discipline" className="text-caption" style={{ color: "var(--color-ink-400)" }}>← 訓育</Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">訓育設定</h1>
      </div>
      <p className="text-caption mb-6" style={{ color: "var(--color-ink-400)" }}>
        設定自動提示門檻。班主任及電郵請於管理員的「班級管理」設定。
      </p>

      {loading ? (
        <p className="text-body text-center py-12" style={{ color: "var(--color-ink-300)" }}>載入中…</p>
      ) : (
        <>
          {/* Per-student per-category thresholds */}
          <h3 className="text-h3 mb-2">學生個人門檻</h3>
          <p className="text-caption mb-3" style={{ color: "var(--color-ink-400)" }}>
            當一名學生某類別紀錄達到門檻，系統會自動電郵該班班主任（每次跨越只發一次）。
          </p>
          <div className="card divide-y mb-6" style={{ borderColor: "var(--color-border)" }}>
            {rows.map((r, i) => (
              <div key={r.category} className="flex items-center gap-3 p-3" style={{ borderColor: "var(--color-border)" }}>
                <label className="flex items-center gap-2 cursor-pointer w-24 shrink-0">
                  <input type="checkbox" checked={r.enabled} onChange={(e) => update(i, { enabled: e.target.checked })} />
                  <span className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>{BEHAVIOR_LABEL[r.category]}</span>
                </label>
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>達到</span>
                  <input type="number" min={1} max={100} value={r.threshold} disabled={!r.enabled}
                    onChange={(e) => update(i, { threshold: Number(e.target.value) })}
                    className="w-20 px-2 py-1 text-body rounded-input border outline-none text-center"
                    style={{ border: "1px solid var(--color-border)", background: r.enabled ? "var(--color-surface)" : "var(--color-surface-2)", color: "var(--color-ink-900)" }} />
                  <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>次時通知班主任</span>
                </div>
              </div>
            ))}
          </div>

          {/* Class-level alert */}
          <h3 className="text-h3 mb-2">班級警示門檻</h3>
          <p className="text-caption mb-3" style={{ color: "var(--color-ink-400)" }}>
            當一個班別的違規類紀錄總數達到門檻，儀表板會標示該班，並自動電郵班主任（每次跨越只發一次）。
          </p>
          <div className="card p-3 mb-6">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 cursor-pointer w-24 shrink-0">
                <input type="checkbox" checked={classAlert.enabled} onChange={(e) => setClassAlert({ ...classAlert, enabled: e.target.checked })} />
                <span className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>啟用</span>
              </label>
              <div className="flex items-center gap-2 flex-1">
                <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>全班違規達到</span>
                <input type="number" min={1} max={1000} value={classAlert.threshold} disabled={!classAlert.enabled}
                  onChange={(e) => setClassAlert({ ...classAlert, threshold: Number(e.target.value) })}
                  className="w-20 px-2 py-1 text-body rounded-input border outline-none text-center"
                  style={{ border: "1px solid var(--color-border)", background: classAlert.enabled ? "var(--color-surface)" : "var(--color-surface-2)", color: "var(--color-ink-900)" }} />
                <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>宗時警示 + 通知班主任</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={save} disabled={saving} className="px-4 py-2 text-body font-medium rounded-input text-white"
              style={{ background: "var(--color-accent)", opacity: saving ? 0.7 : 1 }}>{saving ? "儲存中…" : "儲存設定"}</button>
            {saved && <span className="text-caption" style={{ color: "var(--color-curriculum)" }}>✓ 已儲存</span>}
          </div>
        </>
      )}
    </div>
  )
}
