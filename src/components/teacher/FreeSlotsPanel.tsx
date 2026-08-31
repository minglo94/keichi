"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { StaffPicker } from "@/components/teacher/StaffPicker"
import { COMMITTEES, SUBJECTS } from "@/lib/school-org"

export type Staff = { id: string; name: string | null; nameEn: string | null; email: string | null; image: string | null }

type Period = { period: number | null; label: string | null; startTime: string; endTime: string }

const DAYS = ["", "星期一", "星期二", "星期三", "星期四", "星期五"]

// ─── 共同空堂 ────────────────────────────────────────────────
type FreeData = {
  term: string | null
  periods: Period[]
  resolved:   { id: string; name: string | null; timetableName: string }[]
  unresolved: { id: string; name: string | null }[]
  busy: Record<string, string[]>
  teachers: { id: string; name: string | null; email: string | null }[]
}

/**
 * The grid version of what Keida answers in prose ("夾邊個時段大家都得閒").
 * Pick a 科組／委員會, or add teachers by hand, and see which periods the whole
 * group is free — useful for scheduling a meeting or a whole-panel workshop.
 */
export function FreeSlotsPanel({ staff }: { staff: Staff[] }) {
  const inputCls   = "w-full px-3 py-2 text-body rounded-input border outline-none"
  const inputStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }

  const [dept, setDept] = useState("")
  const [cmte, setCmte] = useState("")
  const [picked, setPicked] = useState<Staff[]>([])
  const [addId, setAddId]   = useState("")
  const [data, setData]     = useState<FreeData | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr]       = useState<string | null>(null)
  const [openSlot, setOpenSlot] = useState<string | null>(null)

  // Adding a teacher by hand switches to an explicit list; the filters then
  // stop applying, so clear them rather than implying they still do.
  useEffect(() => {
    if (!addId) return
    const hit = staff.find((s) => s.id === addId)
    if (hit && !picked.some((p) => p.id === hit.id)) {
      setPicked((prev) => [...prev, hit])
      setDept(""); setCmte("")
    }
    setAddId("")
  }, [addId, staff, picked])

  const search = useCallback(async () => {
    if (picked.length === 0 && !dept && !cmte) { setData(null); setErr(null); return }
    setLoading(true); setErr(null)
    try {
      const res = await fetch("/api/timetable/common-free", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherIds: picked.length > 0 ? picked.map((p) => p.id) : undefined,
          department: picked.length === 0 ? (dept || undefined) : undefined,
          committee:  picked.length === 0 ? (cmte || undefined) : undefined,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d?.error ?? `搜尋失敗 (${res.status})`); setData(null) }
      else setData(d)
    } catch { setErr("搜尋失敗，請重試。") }
    setLoading(false)
  }, [picked, dept, cmte])

  useEffect(() => { const t = setTimeout(search, 250); return () => clearTimeout(t) }, [search])

  const nameOf = (id: string) =>
    data?.teachers.find((t) => t.id === id)?.name ?? "—"

  const periodRows = useMemo(() => {
    const nums = (data?.periods ?? []).filter((p) => p.period !== null).map((p) => p.period as number)
    return Array.from({ length: Math.max(10, ...nums, 0) }, (_, i) => i + 1)
  }, [data])

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h3 className="text-h3 mb-1">共同空堂</h3>
        <p className="text-caption mb-3" style={{ color: "var(--color-ink-400)" }}>
          揀一個科組或委員會，睇下邊幾節大家都冇課 — 用嚟約開會或者安排全科組工作坊。亦可以逐個加教師。
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <select value={dept} disabled={picked.length > 0} onChange={(e) => setDept(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="">選擇科組…</option>
            {SUBJECTS.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <select value={cmte} disabled={picked.length > 0} onChange={(e) => setCmte(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="">選擇委員會…</option>
            {COMMITTEES.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>

        <StaffPicker staff={staff} selectedId={addId} onSelect={setAddId}
          placeholder="加入指定教師…" emptyHint="點擊從教職員中選擇" />

        {picked.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-2">
            {picked.map((p) => (
              <span key={p.id} className="text-caption px-2 py-0.5 rounded-pill flex items-center gap-1"
                style={{ background: "var(--color-surface-2)", color: "var(--color-ink-700)" }}>
                {p.name ?? p.email}
                <button onClick={() => setPicked((prev) => prev.filter((x) => x.id !== p.id))}
                  style={{ color: "var(--color-discipline)" }}>✕</button>
              </span>
            ))}
            <button onClick={() => setPicked([])} className="text-caption" style={{ color: "var(--color-ink-400)" }}>清除全部</button>
          </div>
        )}

        {err     && <p className="text-caption mt-3" style={{ color: "var(--color-discipline)" }}>{err}</p>}
        {loading && <p className="text-caption mt-3" style={{ color: "var(--color-ink-400)" }}>搜尋中…</p>}
      </div>

      {data && !loading && (
        <div className="card p-5">
          <p className="text-caption mb-2" style={{ color: "var(--color-ink-500)" }}>
            {data.resolved.length} 位教師{data.term ? ` · 學期 ${data.term}` : ""}
            {data.resolved.length > 0 && <>：{data.resolved.map((r) => r.name).join("、")}</>}
          </p>

          {data.unresolved.length > 0 && (
            <p className="text-caption mb-2" style={{ color: "var(--color-admin)" }}>
              ⚠ {data.unresolved.length} 位找不到時間表，未計入：{data.unresolved.map((u) => u.name).join("、")}　
              <Link href="/teacher/admin/teachers" className="underline">教師資料</Link>
            </p>
          )}

          {data.resolved.length === 0 ? (
            <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>沒有可對照時間表的教師。</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="bg-gray-700 text-white text-xs px-2 py-2">節次</th>
                    {DAYS.slice(1).map((d) => (
                      <th key={d} className="bg-gray-700 text-white text-xs px-2 py-2">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {periodRows.map((p) => {
                    const time = data.periods.find((x) => x.period === p)
                    return (
                      <tr key={p} className={p % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                        <td className="px-2 py-1.5 text-xs text-center" style={{ color: "var(--color-ink-500)" }}>
                          第{p}節
                          {time && <span className="block text-[10px]" style={{ color: "var(--color-ink-300)" }}>{time.startTime}–{time.endTime}</span>}
                        </td>
                        {[1, 2, 3, 4, 5].map((day) => {
                          const key  = `${day}-${p}`
                          const busy = data.busy[key] ?? []
                          const free = busy.length === 0
                          return (
                            <td key={day} className="px-1 py-1 text-xs text-center align-top">
                              <button onClick={() => setOpenSlot(openSlot === key ? null : key)}
                                className="w-full rounded px-1 py-1"
                                style={{
                                  background: free ? "var(--color-curriculum)" : "transparent",
                                  color:      free ? "#fff" : "var(--color-ink-400)",
                                  opacity:    free ? 0.9 : 1,
                                }}>
                                {free ? "✓ 全員得閒" : `${busy.length} 人有課`}
                              </button>
                              {openSlot === key && busy.length > 0 && (
                                <p className="text-[10px] mt-1" style={{ color: "var(--color-ink-500)" }}>
                                  {busy.map(nameOf).join("、")}
                                </p>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="text-caption mt-2" style={{ color: "var(--color-ink-300)" }}>
                點擊格子睇邊位有課。早會、周會等特別時段唔會顯示喺呢個表。
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
