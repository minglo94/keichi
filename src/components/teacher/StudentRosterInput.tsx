"use client"

import { useRef } from "react"

// Excel-paste student roster grid (班級 → 學號 → 學生姓名).
//
// Extracted from the 活動文件 page so 活動管理 can share the same input.
// Purely presentational: the parent owns the rows and decides what to do
// with them (generate docs, resolve to student accounts, …).

export interface RosterRow {
  id:        number
  className: string
  studentId: string
  name:      string
  /** Optional per-row status, e.g. the result of matching to a student account. */
  status?:   { ok: boolean; label: string }
}

export function makeRow(id: number, className = "", studentId = "", name = ""): RosterRow {
  return { id, className, studentId, name }
}

type Props = {
  rows:      RosterRow[]
  onChange:  (rows: RosterRow[]) => void
  /** Accent colour for the "+ 新增行" button (defaults to the app accent). */
  accent?:   string
  /** Small print under the grid, e.g. what the list will be used for. */
  footnote?: string
}

export function StudentRosterInput({ rows, onChange, accent = "var(--color-accent)", footnote }: Props) {
  const tableRef = useRef<HTMLTableElement>(null)
  const nextId   = useRef(1)

  // Keep the id counter ahead of whatever the parent handed us.
  const maxId = rows.reduce((m, r) => Math.max(m, r.id), 0)
  if (nextId.current <= maxId) nextId.current = maxId + 1

  function addRow() {
    onChange([...rows, makeRow(nextId.current++)])
  }
  function removeRow(id: number) {
    onChange(rows.filter((r) => r.id !== id))
  }
  function updateRow(id: number, field: "className" | "studentId" | "name", value: string) {
    // Editing a cell invalidates any previous match result for that row.
    onChange(rows.map((r) => r.id === id ? { ...r, [field]: value, status: undefined } : r))
  }

  // Paste a block of Excel cells starting at the focused cell, growing the
  // grid as needed so a whole class can be pasted into an empty table.
  function handlePaste(e: React.ClipboardEvent<HTMLTableElement>) {
    const target = e.target as HTMLElement
    if (!target.closest("tbody")) return
    e.preventDefault()

    const text  = e.clipboardData.getData("text/plain")
    const lines = text.split(/\r?\n/).filter((r) => r.trim())
    if (!lines.length) return

    const fields: Array<"className" | "studentId" | "name"> = ["className", "studentId", "name"]
    const focusTr  = target.closest("tr")
    const allTrs   = Array.from(tableRef.current?.querySelectorAll("tbody tr") ?? [])
    const startRow = focusTr ? allTrs.indexOf(focusTr as HTMLTableRowElement) : rows.length
    const inputs   = focusTr ? Array.from(focusTr.querySelectorAll("input")) : []
    let   startCol = inputs.indexOf(target as HTMLInputElement)
    if (startCol < 0) startCol = 0

    const next = [...rows]
    lines.forEach((raw, ri) => {
      const cols   = raw.split("\t").map((c) => c.trim())
      const rowIdx = startRow + ri
      while (rowIdx >= next.length) next.push(makeRow(nextId.current++))
      cols.forEach((val, ci) => {
        const fieldIdx = startCol + ci
        if (fieldIdx < fields.length) {
          next[rowIdx] = { ...next[rowIdx], [fields[fieldIdx]]: val, status: undefined }
        }
      })
    })
    onChange(next)
  }

  const cellInput = "w-full bg-transparent px-2 py-1 text-sm rounded focus:bg-white focus:outline-2 focus:outline-[var(--color-accent)]"

  return (
    <div>
      <div className="flex items-start gap-2 p-3 rounded-lg border text-xs text-blue-800 mb-3"
        style={{ background: "#f0f7ff", borderColor: "#b3d1f5" }}>
        <span>👥</span>
        <span>從 Excel 複製後，<strong>點擊任何一格再按 Ctrl+V</strong>，系統自動填入。欄位順序：<strong>班級 → 學號 → 學生姓名</strong>。</span>
      </div>

      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-sm border-collapse" onPaste={handlePaste}>
          <thead>
            <tr>
              <th className="bg-gray-700 text-white text-xs font-bold px-2 py-2 text-center w-8">#</th>
              <th className="bg-gray-700 text-white text-xs font-bold px-2 py-2 text-left">班級</th>
              <th className="bg-gray-700 text-white text-xs font-bold px-2 py-2 text-left">學號</th>
              <th className="bg-gray-700 text-white text-xs font-bold px-2 py-2 text-left">學生姓名</th>
              <th className="bg-gray-700 text-white text-xs font-bold px-2 py-2 text-left">狀態</th>
              <th className="bg-gray-700 text-white w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.id} className={idx % 2 === 1 ? "bg-gray-50" : "bg-white"}>
                <td className="text-center text-xs text-gray-400 px-2 py-1">{idx + 1}</td>
                <td className="px-1 py-0.5">
                  <input className={cellInput} style={{ minWidth: 52 }} placeholder="1A"
                    value={r.className} onChange={(e) => updateRow(r.id, "className", e.target.value)} />
                </td>
                <td className="px-1 py-0.5">
                  <input className={cellInput} style={{ width: 70 }} placeholder="01"
                    value={r.studentId} onChange={(e) => updateRow(r.id, "studentId", e.target.value)} />
                </td>
                <td className="px-1 py-0.5">
                  <input className={cellInput} placeholder="學生姓名"
                    value={r.name} onChange={(e) => updateRow(r.id, "name", e.target.value)} />
                </td>
                <td className="px-2 py-1 text-xs whitespace-nowrap">
                  {r.status && (
                    <span style={{ color: r.status.ok ? "var(--color-curriculum)" : "var(--color-discipline)" }}>
                      {r.status.ok ? "✓" : "⚠"} {r.status.label}
                    </span>
                  )}
                </td>
                <td className="px-1 py-0.5">
                  <button type="button" onClick={() => removeRow(r.id)}
                    className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mt-3">
        <button type="button" onClick={addRow}
          className="text-xs font-bold px-4 py-1.5 rounded-lg border-2 border-dashed transition-colors"
          style={{ borderColor: accent, color: accent, background: "#f0f4ff" }}>
          + 新增行
        </button>
        {rows.length > 0 && (
          <button type="button"
            onClick={() => { if (confirm("確定清空所有學生資料？")) onChange([]) }}
            className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-500 hover:bg-red-50 transition-colors">
            清空
          </button>
        )}
        <span className="text-xs text-gray-400 ml-auto">
          {rows.filter((r) => r.name.trim()).length} 名學生
        </span>
      </div>

      {footnote && <p className="text-xs text-gray-400 mt-2">{footnote}</p>}
    </div>
  )
}
