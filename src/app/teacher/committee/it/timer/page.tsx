"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"

const PRESETS = [5, 10, 15, 20, 30]

function pad(n: number) { return String(n).padStart(2, "0") }

function formatTime(secs: number) {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${pad(m)}:${pad(s)}`
}

function playBeep() {
  try {
    const ctx  = new AudioContext()
    const freqs = [880, 660, 440]
    freqs.forEach((freq, i) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = freq
      osc.type = "sine"
      gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.3)
      osc.start(ctx.currentTime + i * 0.15)
      osc.stop(ctx.currentTime + i * 0.15 + 0.35)
    })
  } catch { /* no-op if AudioContext unavailable */ }
}

export default function TimerPage() {
  const [total,     setTotal]     = useState(300)  // seconds
  const [remaining, setRemaining] = useState(300)
  const [running,   setRunning]   = useState(false)
  const [custom,    setCustom]    = useState("")

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!running) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }
    intervalRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(intervalRef.current!)
          setRunning(false)
          playBeep()
          return 0
        }
        return r - 1
      })
    }, 1000)
    return () => clearInterval(intervalRef.current!)
  }, [running])

  function setPreset(minutes: number) {
    const secs = minutes * 60
    setTotal(secs)
    setRemaining(secs)
    setRunning(false)
  }

  function applyCustom() {
    const parts = custom.split(":").map(Number)
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const secs = parts[0] * 60 + parts[1]
      if (secs > 0) { setTotal(secs); setRemaining(secs); setRunning(false) }
    } else {
      const mins = parseInt(custom)
      if (!isNaN(mins) && mins > 0) { setTotal(mins * 60); setRemaining(mins * 60); setRunning(false) }
    }
    setCustom("")
  }

  function reset() { setRemaining(total); setRunning(false) }

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {})
    else document.exitFullscreen().catch(() => {})
  }

  const pct  = total > 0 ? remaining / total : 0
  const color = pct > 0.2 ? "var(--color-it)" : pct > 0.1 ? "#f59e0b" : "var(--color-discipline)"
  const done  = remaining === 0

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/teacher/committee/it" className="text-caption" style={{ color: "var(--color-ink-400)" }}>
          ← 資訊科技
        </Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">課堂計時器</h1>
        <button
          onClick={toggleFullscreen}
          className="ml-auto text-caption px-2 py-1 rounded border"
          style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-500)" }}
          title="全螢幕"
        >⛶</button>
      </div>

      {/* Presets */}
      <div className="flex gap-2 flex-wrap mb-6">
        {PRESETS.map((m) => (
          <button
            key={m}
            onClick={() => setPreset(m)}
            className="px-4 py-2 rounded-input text-body border transition-colors"
            style={{
              border:     "1px solid var(--color-border)",
              background: total === m * 60 && !custom ? "var(--color-accent)" : "var(--color-surface)",
              color:      total === m * 60 && !custom ? "white" : "var(--color-ink-700)",
            }}
          >
            {m} 分
          </button>
        ))}
        {/* Custom input */}
        <div className="flex gap-1">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyCustom()}
            placeholder="mm:ss"
            className="w-20 px-2 py-2 text-body rounded-input border outline-none"
            style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }}
          />
          <button
            onClick={applyCustom}
            className="px-3 py-2 rounded-input border text-body"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}
          >設定</button>
        </div>
      </div>

      {/* Timer display */}
      <div className="card p-8 text-center mb-6">
        <div
          className="text-[80px] font-bold leading-none tabular-nums mb-4"
          style={{ color: done ? "var(--color-discipline)" : color, transition: "color 0.5s" }}
        >
          {formatTime(remaining)}
        </div>

        {/* Progress bar */}
        <div className="rounded-full overflow-hidden mb-4" style={{ height: 8, background: "var(--color-surface-2)" }}>
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${pct * 100}%`, background: color }}
          />
        </div>

        {done && (
          <p className="text-h3 font-semibold mb-4" style={{ color: "var(--color-discipline)" }}>時間到！</p>
        )}

        <div className="flex justify-center gap-3">
          <button
            onClick={() => setRunning((v) => !v)}
            disabled={done}
            className="px-6 py-2.5 rounded-input text-body font-medium text-white"
            style={{ background: running ? "#f59e0b" : "var(--color-accent)", opacity: done ? 0.5 : 1 }}
          >
            {running ? "暫停" : "開始"}
          </button>
          <button
            onClick={reset}
            className="px-4 py-2.5 rounded-input text-body border"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}
          >
            重設
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-caption justify-center" style={{ color: "var(--color-ink-400)" }}>
        <span style={{ color: "var(--color-it)" }}>● 正常</span>
        <span style={{ color: "#f59e0b" }}>● 最後 20%</span>
        <span style={{ color: "var(--color-discipline)" }}>● 最後 10%</span>
      </div>
    </div>
  )
}
