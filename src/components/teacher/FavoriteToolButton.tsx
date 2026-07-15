"use client"

import { useState } from "react"

export function FavoriteToolButton({
  toolKey,
  initialFavorited,
  colorVar = "accent",
}: {
  toolKey: string
  initialFavorited: boolean
  colorVar?: string
}) {
  const [favorited, setFavorited] = useState(initialFavorited)
  const [busy, setBusy] = useState(false)

  async function toggle(e: React.MouseEvent) {
    // Prevent the click from bubbling to a parent <Link>
    e.preventDefault()
    e.stopPropagation()
    if (busy) return

    const next = !favorited
    setFavorited(next) // optimistic
    setBusy(true)
    try {
      const res = await fetch("/api/tool-favorites", {
        method:  next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ toolKey }),
      })
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      setFavorited(!next) // revert on failure
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={favorited ? "取消常用" : "加入常用"}
      title={favorited ? "取消常用" : "加入常用"}
      className="shrink-0 transition-transform hover:scale-110 active:scale-90"
      style={{ color: favorited ? `var(--color-${colorVar})` : "var(--color-ink-300)" }}
    >
      <svg
        width="18" height="18" viewBox="0 0 24 24"
        fill={favorited ? "currentColor" : "none"}
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      >
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    </button>
  )
}
