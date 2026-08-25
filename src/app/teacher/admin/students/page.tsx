"use client"

import { useRef, useState } from "react"
import Link from "next/link"

// 學生資料 — paste a whole class from Excel in one go.
// Columns: 班級 → 學號 → 中文姓名 → 英文姓名 → 電郵
// Keyed on email, so re-pasting an updated sheet edits the same students
// instead of duplicating them. Keeping 班級/學號 accurate here is what makes
// activity rosters match automatically later.

type Row = {
  id:        number
  className: string
  classNo:   string
  nameZh:    string
  nameEn:    string
  email:     string
  status?:   { ok: boolean; message: string }
}

const FIELDS: Array<keyof Row> = ["className", "classNo", "nameZh", "nameEn", "email"]

const blank = (id: number): Row => ({ id, className: "", classNo: "", nameZh: "", nameEn: "", email: "" })

export default function AdminStudentsPage() {
  const [rows,    setRows]    = useState<Row[]>(Array.from({ length: 5 }, (_, i) => blank(i + 1)))
  const [saving,  setSaving]  = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [err,     setErr]     = useState<string | null>(null)
  const nextId   = useRef(6)
  const tableRef = useRef<HTMLTableElement>(null)

  function update(id: number, field: keyof Row, value: string) {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value, status: undefined } : r))
  }
  function addRow()            { setRows(prev => [...prev, blank(nextId.current++)]) }
  function removeRow(id: number) { setRows(prev => prev.filter(r => r.id !== id)) }

  // Paste a block of Excel cells starting at the focused cell.
  function handlePaste(e: React.ClipboardEvent<HTMLTableElement>) {
    const target = e.target as HTMLElement
    if (!target.closest("tbody")) return
    e.preventDefault()

    const lines = e.clipboardData.getData("text/plain").split(/\r?\n/).filter(l => l.trim())
    if (!lines.length) return

    const focusTr  = target.closest("tr")
    const allTrs   = Array.from(tableRef.current?.querySelectorAll("tbody tr") ?? [])
    const startRow = focusTr ? allTrs.indexOf(focusTr as HTMLTableRowElement) : rows.length
    const inputs   = focusTr ? Array.from(focusTr.querySelectorAll("input")) : []
    let   startCol = inputs.indexOf(target as HTMLInputElement)
    if (startCol < 0) startCol = 0

    setRows(prev => {
      const next = [...prev]
      lines.forEach((raw, ri) => {
        const cols   = raw.split("\t").map(c => c.trim())
        const rowIdx = startRow + ri
        while (rowIdx >= next.length) next.push(blank(nextId.current++))
        cols.forEach((val, ci) => {
          const f = FIELDS[startCol + ci]
          if (f) next[rowIdx] = { ...next[rowIdx], [f]: val, status: undefined }
        })
      })
      return next
    })
  }

  async function save() {
    setSaving(true); setErr(null); setSummary(null)
    try {
      const res = await fetch("/api/admin/students/bulk", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          rows: rows.map(({ id, className, classNo, nameZh, nameEn, email }) =>
            ({ id, className, classNo, nameZh, nameEn, email })),
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setErr(d?.error ?? `儲存失敗 (${res.status})`)
        setSaving(false)
        return
      }
      const { created, updated, results } = await res.json() as {
        created: number; updated: number
        results: { id: number; ok: boolean; message: string }[]
      }
      const byId = new Map(results.map(r => [r.id, r]))
      setRows(prev => prev.map(r => {
        const hit = byId.get(r.id)
        return hit ? { ...r, status: { ok: hit.ok, message: hit.message } } : r
      }))
      const failed = results.filter(r => !r.ok).length
      setSummary(`已新增 ${created} 人 · 已更新 ${updated} 人${failed ? ` · ${failed} 行未處理` : ""}`)
    } catch {
      setErr("儲存失敗，請重試。")
    }
    setSaving(false)
  }

  const cell = "w-full bg-transparent px-2 py-1 text-sm rounded focus:bg-white focus:outline-2 focus:outline-[var(--color-accent)]"
  const th   = "bg-gray-700 text-white text-xs font-bold px-2 py-2 text-left"

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/teacher" className="text-caption" style={{ color: "var(--color-ink-400)" }}>← 老師主頁</Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">學生資料</h1>
      </div>
      <p className="text-caption mb-5" style={{ color: "var(--color-ink-400)" }}>
        以電郵作識別：重複貼上同一位學生只會更新資料，不會重複建立。班級及學號填得準確，日後貼上活動名單就能自動配對。
      </p>

      <div className="card p-5">
        <div className="flex items-start gap-2 p-3 rounded-lg border text-xs text-blue-800 mb-3"
          style={{ background: "#f0f7ff", borderColor: "#b3d1f5" }}>
          <span>👥</span>
          <span>從 Excel 複製後，<strong>點擊任何一格再按 Ctrl+V</strong>，系統自動填入。欄位順序：<strong>班級 → 學號 → 中文姓名 → 英文姓名 → 電郵</strong>。</span>
        </div>

        <div className="overflow-x-auto">
          <table ref={tableRef} className="w-full text-sm border-collapse" onPaste={handlePaste}>
            <thead>
              <tr>
                <th className={`${th} text-center w-8`}>#</th>
                <th className={th}>班級</th>
                <th className={th}>學號</th>
                <th className={th}>中文姓名</th>
                <th className={th}>英文姓名</th>
                <th className={th}>電郵</th>
                <th className={th}>狀態</th>
                <th className="bg-gray-700 text-white w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.id} className={idx % 2 === 1 ? "bg-gray-50" : "bg-white"}>
                  <td className="text-center text-xs text-gray-400 px-2 py-1">{idx + 1}</td>
                  <td className="px-1 py-0.5"><input className={cell} style={{ minWidth: 56 }} placeholder="1A"
                    value={r.className} onChange={e => update(r.id, "className", e.target.value)} /></td>
                  <td className="px-1 py-0.5"><input className={cell} style={{ width: 64 }} placeholder="01"
                    value={r.classNo} onChange={e => update(r.id, "classNo", e.target.value)} /></td>
                  <td className="px-1 py-0.5"><input className={cell} placeholder="陳大文"
                    value={r.nameZh} onChange={e => update(r.id, "nameZh", e.target.value)} /></td>
                  <td className="px-1 py-0.5"><input className={cell} placeholder="Chan Tai Man"
                    value={r.nameEn} onChange={e => update(r.id, "nameEn", e.target.value)} /></td>
                  <td className="px-1 py-0.5"><input className={cell} placeholder="s12345@stu.keichi.edu.hk"
                    value={r.email} onChange={e => update(r.id, "email", e.target.value)} /></td>
                  <td className="px-2 py-1 text-xs whitespace-nowrap">
                    {r.status && (
                      <span style={{ color: r.status.ok ? "var(--color-curriculum)" : "var(--color-discipline)" }}>
                        {r.status.ok ? "✓" : "⚠"} {r.status.message}
                      </span>
                    )}
                  </td>
                  <td className="px-1 py-0.5">
                    <button type="button" onClick={() => removeRow(r.id)}
                      className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-3 mt-3">
          <button type="button" onClick={addRow}
            className="text-xs font-bold px-4 py-1.5 rounded-lg border-2 border-dashed"
            style={{ borderColor: "var(--color-accent)", color: "var(--color-accent)", background: "#f0f4ff" }}>
            + 新增行
          </button>
          <button type="button"
            onClick={() => { if (confirm("確定清空所有資料？")) setRows(Array.from({ length: 5 }, (_, i) => blank(nextId.current + i))) }}
            className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-500 hover:bg-red-50">
            清空
          </button>
          <span className="text-xs text-gray-400 ml-auto">
            {rows.filter(r => r.email.trim()).length} 名學生
          </span>
        </div>

        {err     && <p className="text-caption mt-3" style={{ color: "var(--color-discipline)" }}>{err}</p>}
        {summary && <p className="text-caption mt-3" style={{ color: "var(--color-curriculum)" }}>✓ {summary}</p>}

        <div className="flex justify-end mt-4">
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-body font-medium rounded-input text-white"
            style={{ background: "var(--color-accent)", opacity: saving ? 0.7 : 1 }}>
            {saving ? "儲存中…" : "儲存學生資料"}
          </button>
        </div>
      </div>
    </div>
  )
}
