"use client"

import { useEffect, useRef, useState } from "react"

// 課堂計時器 + 秒錶. One component, two modes: a countdown with presets, and a
// stopwatch that counts up (reading time, video length, PE). Used standalone at
// /teacher/committee/it/timer and as a panel inside 課堂.

const PRESETS = [1, 3, 5, 10, 15, 20, 30]

const pad = (n: number) => String(n).padStart(2, "0")

export function formatTime(secs: number) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export function playBeep() {
  try {
    const ctx   = new AudioContext()
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

export function ClassTimer({
  initialMode = "countdown",
  allowModeSwitch = true,
  big = false,
}: {
  initialMode?: "countdown" | "stopwatch"
  allowModeSwitch?: boolean
  /** Larger digits — for 投影模式. */
  big?: boolean
}) {
  const [mode,      setMode]      = useState(initialMode)
  const [total,     setTotal]     = useState(300)
  const [remaining, setRemaining] = useState(300)
  const [elapsed,   setElapsed]   = useState(0)
  const [laps,      setLaps]      = useState<number[]>([])
  const [running,   setRunning]   = useState(false)
  const [custom,    setCustom]    = useState("")

  // Wall-clock based, not tick-counting: setInterval drifts and pauses in a
  // background tab, so counting ticks would be wrong after a teacher switches
  // apps mid-lesson. We remember when the run started and derive from now.
  const startedAt = useRef<number | null>(null)
  const base      = useRef(0) // seconds banked before the current run

  useEffect(() => {
    if (!running) return
    startedAt.current = Date.now()
    const id = setInterval(() => {
      const run = Math.floor((Date.now() - (startedAt.current ?? Date.now())) / 1000)
      if (mode === "stopwatch") {
        setElapsed(base.current + run)
      } else {
        const left = Math.max(0, base.current - run)
        setRemaining(left)
        if (left === 0) {
          setRunning(false)
          base.current = 0
          playBeep()
        }
      }
    }, 250)
    return () => clearInterval(id)
  }, [running, mode])

  function pause() {
    if (startedAt.current !== null) {
      const run = Math.floor((Date.now() - startedAt.current) / 1000)
      base.current = mode === "stopwatch" ? base.current + run : Math.max(0, base.current - run)
    }
    startedAt.current = null
    setRunning(false)
  }

  function start() {
    if (mode === "countdown") {
      if (remaining === 0) return
      base.current = remaining
    } else {
      base.current = elapsed
    }
    setRunning(true)
  }

  function setPreset(minutes: number) {
    const secs = minutes * 60
    setRunning(false); startedAt.current = null
    setTotal(secs); setRemaining(secs); base.current = secs
  }

  function applyCustom() {
    const parts = custom.split(":").map(Number)
    let secs = 0
    if (parts.length === 2 && parts.every((p) => !isNaN(p))) secs = parts[0] * 60 + parts[1]
    else if (!isNaN(parseInt(custom))) secs = parseInt(custom) * 60
    if (secs > 0) setPreset(secs / 60)
    setCustom("")
  }

  function reset() {
    setRunning(false); startedAt.current = null
    if (mode === "countdown") { setRemaining(total); base.current = total }
    else { setElapsed(0); setLaps([]); base.current = 0 }
  }

  function switchMode(m: "countdown" | "stopwatch") {
    if (m === mode) return
    setRunning(false); startedAt.current = null
    setMode(m)
    base.current = m === "countdown" ? remaining : elapsed
  }

  const isCountdown = mode === "countdown"
  const pct   = isCountdown && total > 0 ? remaining / total : 1
  const color = !isCountdown ? "var(--color-accent)"
    : pct > 0.2 ? "var(--color-it)" : pct > 0.1 ? "#f59e0b" : "var(--color-discipline)"
  const done  = isCountdown && remaining === 0
  const shown = isCountdown ? remaining : elapsed

  const btn = "px-4 py-2 rounded-input text-body border transition-colors"
  const btnStyle = (active: boolean) => ({
    border:     "1px solid var(--color-border)",
    background: active ? "var(--color-accent)" : "var(--color-surface)",
    color:      active ? "white" : "var(--color-ink-700)",
  })

  return (
    <div className="space-y-4">
      {allowModeSwitch && (
        <div className="flex gap-1 p-1 rounded-input w-fit" style={{ background: "var(--color-surface-2)" }}>
          {([["countdown", "倒數計時"], ["stopwatch", "秒錶"]] as const).map(([m, label]) => (
            <button key={m} onClick={() => switchMode(m)}
              className="px-3 py-1.5 text-caption font-medium rounded-input"
              style={{
                background: mode === m ? "var(--color-surface)" : "transparent",
                color:      mode === m ? "var(--color-ink-900)" : "var(--color-ink-500)",
                boxShadow:  mode === m ? "0 1px 3px rgb(0 0 0 / 0.06)" : "none",
              }}>
              {label}
            </button>
          ))}
        </div>
      )}

      {isCountdown && (
        <div className="flex gap-2 flex-wrap">
          {PRESETS.map((m) => (
            <button key={m} onClick={() => setPreset(m)} className={btn} style={btnStyle(total === m * 60)}>
              {m} 分
            </button>
          ))}
          <div className="flex gap-1">
            <input value={custom} onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyCustom()} placeholder="mm:ss"
              className="w-20 px-2 py-2 text-body rounded-input border outline-none"
              style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }} />
            <button onClick={applyCustom} className={btn} style={btnStyle(false)}>設定</button>
          </div>
        </div>
      )}

      <div className="card p-6 text-center">
        <div className="font-bold leading-none tabular-nums mb-4"
          style={{ fontSize: big ? "min(28vw, 320px)" : 80, color: done ? "var(--color-discipline)" : color, transition: "color 0.5s" }}>
          {formatTime(shown)}
        </div>

        {isCountdown && (
          <div className="rounded-full overflow-hidden mb-4" style={{ height: 8, background: "var(--color-surface-2)" }}>
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct * 100}%`, background: color }} />
          </div>
        )}

        {done && <p className="text-h3 font-semibold mb-4" style={{ color: "var(--color-discipline)" }}>時間到！</p>}

        <div className="flex justify-center gap-3">
          <button onClick={running ? pause : start} disabled={done}
            className="px-6 py-2.5 rounded-input text-body font-medium text-white"
            style={{ background: running ? "#f59e0b" : "var(--color-accent)", opacity: done ? 0.5 : 1 }}>
            {running ? "暫停" : "開始"}
          </button>
          {!isCountdown && running && (
            <button onClick={() => setLaps((l) => [elapsed, ...l])} className={btn} style={btnStyle(false)}>分段</button>
          )}
          <button onClick={reset} className={btn} style={btnStyle(false)}>重設</button>
        </div>

        {!isCountdown && laps.length > 0 && (
          <ol className="mt-4 text-body tabular-nums space-y-0.5" style={{ color: "var(--color-ink-500)" }}>
            {laps.map((t, i) => <li key={i}>第 {laps.length - i} 段　{formatTime(t)}</li>)}
          </ol>
        )}
      </div>
    </div>
  )
}
