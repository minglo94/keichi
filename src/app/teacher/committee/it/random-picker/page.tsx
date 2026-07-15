"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"

const STORAGE_KEY = "ichi-picker-names"

export default function RandomPickerPage() {
  const [namesText,     setNamesText]     = useState("")
  const [names,         setNames]         = useState<string[]>([])
  const [picked,        setPicked]        = useState<string[]>([])
  const [current,       setCurrent]       = useState<string | null>(null)
  const [spinning,      setSpinning]      = useState(false)
  const [excludePicked, setExcludePicked] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      setNamesText(saved)
      setNames(saved.split("\n").map((n) => n.trim()).filter(Boolean))
    }
  }, [])

  function saveNames(text: string) {
    setNamesText(text)
    localStorage.setItem(STORAGE_KEY, text)
    setNames(text.split("\n").map((n) => n.trim()).filter(Boolean))
  }

  function spin() {
    const pool = excludePicked ? names.filter((n) => !picked.includes(n)) : names
    if (pool.length === 0) return
    if (spinning) return

    setSpinning(true)
    let i = 0
    let elapsed = 0

    function tick(interval: number) {
      timerRef.current = setTimeout(() => {
        setCurrent(pool[i++ % pool.length])
        elapsed += interval
        if (elapsed < 1200) {
          tick(80)
        } else if (elapsed < 1600) {
          tick(150)
        } else if (elapsed < 2000) {
          tick(250)
        } else {
          const winner = pool[Math.floor(Math.random() * pool.length)]
          setCurrent(winner)
          setPicked((p) => [...p, winner])
          setSpinning(false)
        }
      }, interval)
    }

    tick(80)
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const pool = excludePicked ? names.filter((n) => !picked.includes(n)) : names

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/teacher/committee/it" className="text-caption" style={{ color: "var(--color-ink-400)" }}>
          ← 資訊科技
        </Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">隨機點名器</h1>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Name list input */}
        <div className="space-y-3">
          <div>
            <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>
              學生名單（每行一個，自動儲存）
            </label>
            <textarea
              rows={10}
              value={namesText}
              onChange={(e) => saveNames(e.target.value)}
              placeholder={"陳大文\n李小明\n王美華"}
              className="w-full px-3 py-2 text-body rounded-input border outline-none resize-none"
              style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }}
            />
            <p className="text-caption mt-1" style={{ color: "var(--color-ink-300)" }}>
              {names.length} 人 · 可抄 {pool.length} 人
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={excludePicked}
              onChange={(e) => setExcludePicked(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-caption" style={{ color: "var(--color-ink-700)" }}>排除已抄出的學生</span>
          </label>
        </div>

        {/* Picker display */}
        <div className="flex flex-col items-center gap-4">
          {/* Spin circle */}
          <div
            className="w-48 h-48 rounded-full flex items-center justify-center text-white font-bold text-center leading-tight"
            style={{
              background:  spinning ? "var(--color-accent)" : current ? "var(--color-curriculum)" : "var(--color-surface-2)",
              color:       current ? "white" : "var(--color-ink-300)",
              fontSize:    current && current.length > 4 ? 22 : 28,
              transition:  "background 0.3s",
              boxShadow:   "0 4px 20px oklch(0% 0 0 / 12%)",
            }}
          >
            {spinning ? current ?? "…" : current ?? "按下抄籤"}
          </div>

          <button
            onClick={spin}
            disabled={pool.length === 0 || spinning}
            className="px-8 py-3 rounded-input text-body font-medium text-white"
            style={{ background: "var(--color-accent)", opacity: pool.length === 0 || spinning ? 0.5 : 1 }}
          >
            {spinning ? "抄籤中…" : "抄籤"}
          </button>
          {names.length === 0 && (
            <p className="text-caption text-center" style={{ color: "var(--color-ink-400)" }}>
              請先在左方輸入學生名單
            </p>
          )}
          {names.length > 0 && pool.length === 0 && (
            <p className="text-caption text-center" style={{ color: "var(--color-ink-400)" }}>
              所有學生已抄出，請按「重置記錄」
            </p>
          )}

          {picked.length > 0 && (
            <button
              onClick={() => setPicked([])}
              className="text-caption px-3 py-1 rounded border"
              style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-500)" }}
            >
              重置記錄
            </button>
          )}
        </div>
      </div>

      {/* Picked history */}
      {picked.length > 0 && (
        <div className="mt-6 card p-4">
          <p className="text-caption mb-3 font-medium" style={{ color: "var(--color-ink-700)" }}>
            已抄出（{picked.length} 人）
          </p>
          <div className="flex flex-wrap gap-2">
            {picked.map((name, i) => (
              <span
                key={i}
                className="text-caption px-2.5 py-1 rounded-pill"
                style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
              >
                {i + 1}. {name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
