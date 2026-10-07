"use client"

import { useEffect, useMemo, useRef, useState } from "react"

// 抽籤 / 隨機點名.
//
// Two ways to use it. With `items`, it draws from a live roster (課堂) and shows
// no name box. Without, it is the standalone tool: names typed one per line and
// remembered in localStorage under `storageKey` — the same key the original page
// used, so teachers' saved lists survive the move into this component.
//
// Items carry an id, so two students both called 陳大文 are still two people
// and 排除已抽出 excludes the right one.

export type PickItem = { id: string; label: string }

const DEFAULT_KEY = "ichi-picker-names"

export function RandomPicker({
  items,
  storageKey = DEFAULT_KEY,
  big = false,
  onPick,
}: {
  items?: PickItem[]
  storageKey?: string
  /** Larger display — for 投影模式. */
  big?: boolean
  onPick?: (item: PickItem) => void
}) {
  const standalone = items === undefined
  const [namesText, setNamesText] = useState("")
  const [picked,    setPicked]    = useState<PickItem[]>([])
  const [current,   setCurrent]   = useState<PickItem | null>(null)
  const [spinning,  setSpinning]  = useState(false)
  // Inside 課堂 a fair draw (no repeats) is the sensible default; the
  // standalone tool keeps its original default so nothing changes for it.
  const [exclude,   setExclude]   = useState(!standalone)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!standalone) return
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) setNamesText(saved)
    } catch { /* private mode etc. */ }
  }, [standalone, storageKey])

  const all: PickItem[] = useMemo(() => standalone
    ? namesText.split("\n").map((n) => n.trim()).filter(Boolean).map((label, i) => ({ id: `${i}:${label}`, label }))
    : items!, [standalone, namesText, items])

  const pickedIds = useMemo(() => new Set(picked.map((p) => p.id)), [picked])
  const pool = exclude ? all.filter((n) => !pickedIds.has(n.id)) : all

  // Read the pool at each tick rather than closing over it once at spin start,
  // so a roster change mid-spin can't award someone who is no longer there.
  const poolRef = useRef(pool)
  poolRef.current = pool

  function saveNames(text: string) {
    setNamesText(text)
    try { localStorage.setItem(storageKey, text) } catch { /* ignore */ }
  }

  function spin() {
    if (spinning || poolRef.current.length === 0) return
    setSpinning(true)
    let i = 0
    let elapsed = 0
    const tick = (interval: number) => {
      timer.current = setTimeout(() => {
        const p = poolRef.current
        if (p.length === 0) { setSpinning(false); return }
        setCurrent(p[i++ % p.length])
        elapsed += interval
        if (elapsed < 1200)      tick(80)
        else if (elapsed < 1600) tick(150)
        else if (elapsed < 2000) tick(250)
        else {
          const winner = p[Math.floor(Math.random() * p.length)]
          setCurrent(winner)
          setPicked((prev) => [...prev, winner])
          setSpinning(false)
          onPick?.(winner)
        }
      }, interval)
    }
    tick(80)
  }

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const size = big ? "min(60vw, 520px)" : "12rem"
  const label = current?.label ?? null

  return (
    <div className="space-y-6">
      <div className={standalone ? "grid md:grid-cols-2 gap-6" : "flex flex-col items-center gap-4"}>
        {standalone && (
          <div className="space-y-3">
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>
                學生名單（每行一個，自動儲存）
              </label>
              <textarea rows={10} value={namesText} onChange={(e) => saveNames(e.target.value)}
                placeholder={"陳大文\n李小明\n王美華"}
                className="w-full px-3 py-2 text-body rounded-input border outline-none resize-none"
                style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }} />
              <p className="text-caption mt-1" style={{ color: "var(--color-ink-300)" }}>
                {all.length} 人 · 可抽 {pool.length} 人
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col items-center gap-4">
          <div className="rounded-full flex items-center justify-center font-bold text-center leading-tight px-4"
            style={{
              width: size, height: size,
              background: spinning ? "var(--color-accent)" : label ? "var(--color-curriculum)" : "var(--color-surface-2)",
              color:      label ? "white" : "var(--color-ink-300)",
              fontSize:   big ? (label && label.length > 4 ? "min(8vw, 72px)" : "min(11vw, 104px)") : (label && label.length > 4 ? 22 : 28),
              transition: "background 0.3s",
              boxShadow:  "0 4px 20px oklch(0% 0 0 / 12%)",
            }}>
            {spinning ? label ?? "…" : label ?? "按下抽籤"}
          </div>

          <button onClick={spin} disabled={pool.length === 0 || spinning}
            className="px-8 py-3 rounded-input text-body font-medium text-white"
            style={{ background: "var(--color-accent)", opacity: pool.length === 0 || spinning ? 0.5 : 1 }}>
            {spinning ? "抽籤中…" : "抽籤"}
          </button>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input type="checkbox" checked={exclude} onChange={(e) => setExclude(e.target.checked)} className="w-4 h-4" />
            <span className="text-caption" style={{ color: "var(--color-ink-700)" }}>
              排除已抽出的學生{!standalone && `（可抽 ${pool.length}／${all.length} 人）`}
            </span>
          </label>

          {all.length === 0 && (
            <p className="text-caption text-center" style={{ color: "var(--color-ink-400)" }}>
              {standalone ? "請先在左方輸入學生名單" : "名單未有學生"}
            </p>
          )}
          {all.length > 0 && pool.length === 0 && (
            <p className="text-caption text-center" style={{ color: "var(--color-ink-400)" }}>
              所有學生已抽出，請按「重置記錄」
            </p>
          )}
          {picked.length > 0 && (
            <button onClick={() => { setPicked([]); setCurrent(null) }}
              className="text-caption px-3 py-1 rounded border"
              style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-500)" }}>
              重置記錄
            </button>
          )}
        </div>
      </div>

      {picked.length > 0 && (
        <div className="card p-4">
          <p className="text-caption mb-3 font-medium" style={{ color: "var(--color-ink-700)" }}>
            已抽出（{picked.length} 人）
          </p>
          <div className="flex flex-wrap gap-2">
            {picked.map((p, i) => (
              <span key={`${p.id}-${i}`} className="text-caption px-2.5 py-1 rounded-pill"
                style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
                {i + 1}. {p.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
