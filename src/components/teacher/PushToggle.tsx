"use client"

import { useEffect, useState } from "react"

// Enables/disables Web Push for THIS device (each phone/iPad registers
// separately). Rendered inside the notification bell so the permission
// prompt is always triggered by a tap — iOS requires a user gesture.

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw     = atob(base64)
  const out     = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

type State = "loading" | "unsupported" | "needs-install" | "unconfigured" | "off" | "on"

export function PushToggle() {
  const [state, setState] = useState<State>("loading")
  const [busy,  setBusy]  = useState(false)
  const [err,   setErr]   = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function init() {
      // iOS only supports Web Push once the site is installed to the Home
      // Screen — in a Safari tab the APIs are missing entirely.
      const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent)
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true

      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        if (!cancelled) setState(isIOS && !standalone ? "needs-install" : "unsupported")
        return
      }

      try {
        const reg = await navigator.serviceWorker.register("/sw.js")
        const sub = await reg.pushManager.getSubscription()

        const res  = await fetch(`/api/push/subscribe${sub ? `?endpoint=${encodeURIComponent(sub.endpoint)}` : ""}`)
        const data = await res.json()

        if (cancelled) return
        if (!data.configured) { setState("unconfigured"); return }
        setState(sub && data.subscribed ? "on" : "off")
      } catch {
        if (!cancelled) setState("unsupported")
      }
    }

    init()
    return () => { cancelled = true }
  }, [])

  async function enable() {
    setBusy(true); setErr(null)
    try {
      const permission = await window.Notification.requestPermission()
      if (permission !== "granted") {
        setErr("你已拒絕通知權限，請在裝置設定中開啟。")
        setBusy(false)
        return
      }

      const reg = await navigator.serviceWorker.ready
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!key) { setErr("伺服器未設定推送金鑰。"); setBusy(false); return }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      })

      const res = await fetch("/api/push/subscribe", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(sub.toJSON()),
      })
      if (!res.ok) throw new Error(String(res.status))
      setState("on")
    } catch {
      setErr("啟用失敗，請重試。")
    }
    setBusy(false)
  }

  async function disable() {
    setBusy(true); setErr(null)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await fetch("/api/push/subscribe", {
          method:  "DELETE",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {})
        await sub.unsubscribe()
      }
      setState("off")
    } catch {
      setErr("關閉失敗，請重試。")
    }
    setBusy(false)
  }

  if (state === "loading" || state === "unsupported") return null

  const note = (text: string) => (
    <p className="text-[10px] px-3 py-2" style={{ color: "var(--color-ink-400)" }}>{text}</p>
  )

  if (state === "needs-install")  return note("想喺手機收通知？請用 Safari 的「加入主畫面」安裝後再開啟。")
  if (state === "unconfigured")   return note("伺服器尚未設定推送通知。")

  return (
    <div className="px-3 py-2">
      <button
        onClick={state === "on" ? disable : enable}
        disabled={busy}
        className="w-full text-left text-[11px] font-medium transition-opacity"
        style={{ color: state === "on" ? "var(--color-ink-400)" : "var(--color-accent)", opacity: busy ? 0.6 : 1 }}
      >
        {busy
          ? "處理中…"
          : state === "on"
            ? "🔕 關閉此裝置的推送通知"
            : "🔔 啟用此裝置的推送通知"}
      </button>
      {err && <p className="text-[10px] mt-1" style={{ color: "var(--color-discipline)" }}>{err}</p>}
    </div>
  )
}
