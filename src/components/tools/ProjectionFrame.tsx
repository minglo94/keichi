"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

// 投影模式: put one panel — the timer, the picker, the seating chart — full
// screen on the projector, at a size the back row can read.
//
// Fullscreen is requested on this panel's own element, not on
// document.documentElement (which is what the old timer did), so the sidebar
// and the rest of the page never appear on the projector.
//
// Children are a render prop so they can switch to large type when projecting.

export function ProjectionFrame({ title, children }: { title: string; children: (projecting: boolean) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [projecting, setProjecting] = useState(false)

  useEffect(() => {
    const onChange = () => setProjecting(document.fullscreenElement === ref.current)
    document.addEventListener("fullscreenchange", onChange)
    return () => document.removeEventListener("fullscreenchange", onChange)
  }, [])

  // iPad Safari supports element fullscreen only partially; fall back to a
  // fixed overlay that covers the viewport, which is what actually matters.
  const [overlay, setOverlay] = useState(false)
  const on = projecting || overlay

  async function toggle() {
    if (on) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => {})
      setOverlay(false)
      return
    }
    const el = ref.current
    if (el?.requestFullscreen) {
      try { await el.requestFullscreen(); return } catch { /* fall through */ }
    }
    setOverlay(true)
  }

  useEffect(() => {
    if (!overlay) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOverlay(false) }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [overlay])

  return (
    <div ref={ref}
      className={on ? "overflow-auto p-6 md:p-10" : ""}
      style={on ? {
        background: "var(--color-bg)",
        ...(overlay ? { position: "fixed", inset: 0, zIndex: 60 } : {}),
      } : undefined}>
      <div className="flex items-center gap-2 mb-3">
        {on && <h2 className="text-h1">{title}</h2>}
        <button onClick={toggle}
          className="ml-auto text-caption px-3 py-1.5 rounded-input border"
          style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-500)", background: "var(--color-surface)" }}
          title={on ? "離開投影模式（Esc）" : "投影模式"}>
          {on ? "✕ 離開投影" : "⛶ 投影模式"}
        </button>
      </div>
      {children(on)}
    </div>
  )
}
