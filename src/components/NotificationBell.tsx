"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { getPusherClient } from "@/lib/pusher-client"
import { PushToggle } from "@/components/teacher/PushToggle"

type Notification = {
  id:        string
  type:      string
  title:     string
  body:      string | null
  link:      string | null
  read:      boolean
  createdAt: string
}

export function NotificationBell() {
  const { data: session } = useSession()
  const userId = (session?.user as { id?: string } | undefined)?.id

  const [items,  setItems]  = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [open,   setOpen]   = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications")
      if (!res.ok) return
      const data = await res.json()
      setItems(data.items ?? [])
      setUnread(data.unread ?? 0)
    } catch {}
  }, [])

  // Initial load + 60s poll fallback
  useEffect(() => {
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [load])

  // Live updates via Pusher private channel
  useEffect(() => {
    if (!userId) return
    let channel: ReturnType<NonNullable<ReturnType<typeof getPusherClient>>["subscribe"]> | null = null
    try {
      const pusher = getPusherClient()
      if (!pusher) return
      channel = pusher.subscribe(`private-user-${userId}`)
      channel.bind("notification", () => load())
      channel.bind("doc-approval", () => load())
    } catch {}
    return () => {
      try { channel?.unbind_all(); getPusherClient()?.unsubscribe(`private-user-${userId}`) } catch {}
    }
  }, [userId, load])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onClick)
    return () => document.removeEventListener("mousedown", onClick)
  }, [open])

  async function openPanel() {
    setOpen((v) => !v)
    if (!open && unread > 0) {
      setUnread(0)
      setItems((prev) => prev.map((n) => ({ ...n, read: true })))
      await fetch("/api/notifications/read", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ all: true }),
      }).catch(() => {})
    }
  }

  return (
    <div className="relative shrink-0" ref={boxRef}>
      <button
        onClick={openPanel}
        title="通知"
        className="relative p-1 rounded-md transition-colors hover:bg-[var(--color-surface-2)]"
        style={{ color: "var(--color-ink-500)" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
            style={{ background: "var(--color-discipline)" }}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute bottom-full left-0 mb-2 w-72 max-w-[calc(100vw-2rem)] max-h-96 overflow-y-auto card shadow-2xl z-50"
          style={{ background: "var(--color-surface)" }}
        >
          <div className="px-3 py-2 border-b" style={{ borderColor: "var(--color-border)" }}>
            <p className="text-caption font-medium" style={{ color: "var(--color-ink-700)" }}>通知</p>
          </div>
          {items.length === 0 ? (
            <p className="text-caption text-center py-8" style={{ color: "var(--color-ink-300)" }}>暫無通知</p>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {items.map((n) => {
                const inner = (
                  <div className="px-3 py-2.5 hover:bg-[var(--color-surface-2)] transition-colors">
                    <p className="text-caption font-medium" style={{ color: "var(--color-ink-900)" }}>{n.title}</p>
                    {n.body && <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: "var(--color-ink-500)" }}>{n.body}</p>}
                    <p className="text-[10px] mt-1" style={{ color: "var(--color-ink-400)" }}>
                      {new Date(n.createdAt).toLocaleString("zh-HK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                )
                return n.link
                  ? <Link key={n.id} href={n.link} onClick={() => setOpen(false)} className="block">{inner}</Link>
                  : <div key={n.id}>{inner}</div>
              })}
            </div>
          )}
          <div className="border-t" style={{ borderColor: "var(--color-border)" }}>
            <PushToggle />
          </div>
        </div>
      )}
    </div>
  )
}
