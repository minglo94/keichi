"use client"

/**
 * GoogleCalendarSettings
 * ──────────────────────────────────────────────────────────
 * Drop-in settings panel for Google Calendar integration.
 *
 * Shows:
 *   - Current connection status (connected / not connected)
 *   - Synced vs unsynced event counts
 *   - Watch channel status + expiry
 *   - Actions: Connect, Sync Now, Disconnect
 *
 * Usage:
 *   import GoogleCalendarSettings from "@/components/GoogleCalendarSettings"
 *   <GoogleCalendarSettings />
 *
 * Reads: GET /api/google-calendar/status
 * Actions:
 *   Connect    → GET /api/google-calendar/connect  (browser redirect)
 *   Sync Now   → POST /api/google-calendar/sync
 *   Disconnect → POST /api/google-calendar/disconnect
 */

import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"

interface CalendarStatus {
  connected: boolean
  googleCalendarId?: string
  watchActive?: boolean
  watchExpiry?: string
  lastSyncAt?: string
  syncedEventsCount?: number
  unsyncedEventsCount?: number
}

type SyncDirection = "push" | "pull" | "both"

export default function GoogleCalendarSettings() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<CalendarStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  // Temporary toast
  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/google-calendar/status")
      const data = await res.json()
      setStatus(data)
    } catch {
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  // Handle redirect-back query params from the unified OAuth callback
  useEffect(() => {
    if (searchParams.get("gcal_connected") === "1") {
      showToast("成功連結 Google Calendar！")
      fetchStatus()
    }
    // Unified error param from /api/oauth/callback
    const oauthError = searchParams.get("oauth_error")
    const service    = searchParams.get("service")
    if (oauthError && service === "google-calendar") {
      const messages: Record<string, string> = {
        denied:           "您取消了授權。",
        state_mismatch:   "安全驗證失敗，請重試。",
        invalid_state:    "安全驗證失敗，請重試。",
        expired:          "授權已過期，請重試。",
        token_exchange:   "換取 token 失敗，請重試。",
        no_refresh_token: "未取得 refresh token，請重試授權。",
        calendar_create:  "建立專用日曆失敗，請重試。",
        network:          "網絡錯誤，請重試。",
        unknown_service:  "服務設定錯誤，請聯絡管理員。",
      }
      showToast(messages[oauthError] ?? "連結失敗，請重試。", false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleConnect = () => {
    window.location.href = "/api/oauth/connect?service=google-calendar"
  }

  const handleSync = async (direction: SyncDirection = "both") => {
    setSyncing(true)
    try {
      const res = await fetch("/api/google-calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      })
      const data = await res.json()
      if (res.ok) {
        showToast(`同步完成：推送 ${data.pushed} 個，拉取 ${data.pulled} 個活動`)
        fetchStatus()
      } else {
        showToast(data.error ?? "同步失敗", false)
      }
    } catch {
      showToast("同步失敗", false)
    } finally {
      setSyncing(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm("確定要解除 Google Calendar 連結？本站活動的同步記錄將被清除。")) return
    setDisconnecting(true)
    try {
      const res = await fetch("/api/google-calendar/disconnect", { method: "POST" })
      if (res.ok) {
        showToast("已解除 Google Calendar 連結")
        setStatus({ connected: false })
      } else {
        showToast("解除連結失敗", false)
      }
    } catch {
      showToast("解除連結失敗", false)
    } finally {
      setDisconnecting(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <span className="text-sm text-gray-500">載入中...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        {/* Google Calendar icon (SVG) */}
        <svg className="h-8 w-8 flex-shrink-0" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="4" fill="#1a73e8" />
          <rect x="4" y="6" width="16" height="14" rx="1" fill="white" />
          <rect x="4" y="6" width="16" height="4" rx="1" fill="#1a73e8" />
          <rect x="7" y="4" width="2" height="4" rx="1" fill="#1a73e8" />
          <rect x="15" y="4" width="2" height="4" rx="1" fill="#1a73e8" />
          <text x="12" y="17" textAnchor="middle" fontSize="6" fontWeight="bold" fill="#1a73e8">
            {new Date().getDate()}
          </text>
        </svg>
        <div>
          <h3 className="font-semibold text-gray-900">Google Calendar 同步</h3>
          <p className="text-xs text-gray-500">將本站行事曆活動同步至您的 Google Calendar</p>
        </div>
        {/* Status badge */}
        <span
          className={`ml-auto rounded-full px-2.5 py-1 text-xs font-medium ${
            status?.connected
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {status?.connected ? "已連結" : "未連結"}
        </span>
      </div>

      {/* Connected state */}
      {status?.connected && (
        <div className="space-y-3">
          {/* Stats row */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard
              label="已同步活動"
              value={status.syncedEventsCount ?? 0}
              colorClass="text-green-600"
            />
            <StatCard
              label="待同步活動"
              value={status.unsyncedEventsCount ?? 0}
              colorClass={
                (status.unsyncedEventsCount ?? 0) > 0 ? "text-amber-600" : "text-gray-400"
              }
            />
            <StatCard
              label="推送通知"
              value={status.watchActive ? "啟用中" : "未啟用"}
              colorClass={status.watchActive ? "text-blue-600" : "text-gray-400"}
            />
          </div>

          {/* Watch expiry warning */}
          {status.watchExpiry && (
            <p className="text-xs text-gray-400">
              推送通知到期：{new Date(status.watchExpiry).toLocaleDateString("zh-HK")}
              （系統自動續期）
            </p>
          )}

          {/* Unsynced warning with backfill prompt */}
          {(status.unsyncedEventsCount ?? 0) > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
              <span className="text-amber-500 mt-0.5 text-sm">⚠</span>
              <div>
                <p className="text-xs font-medium text-amber-800">
                  有 {status.unsyncedEventsCount} 個活動尚未同步至 Google Calendar
                </p>
                <p className="text-xs text-amber-600 mt-0.5">
                  （可能是連結前建立的活動）
                </p>
                <button
                  onClick={() => handleSync("push")}
                  disabled={syncing}
                  className="mt-2 text-xs font-medium text-amber-700 underline hover:no-underline disabled:opacity-50"
                >
                  立即補同步 →
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              onClick={() => handleSync("both")}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
            >
              {syncing ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0115-4.5M20 15a9 9 0 01-15 4.5" />
                </svg>
              )}
              {syncing ? "同步中..." : "立即同步"}
            </button>

            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60 transition-colors"
            >
              {disconnecting ? "解除中..." : "解除連結"}
            </button>
          </div>
        </div>
      )}

      {/* Disconnected state */}
      {!status?.connected && (
        <div className="space-y-4">
          <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600 space-y-2">
            <p className="font-medium text-gray-700">連結後可以：</p>
            <ul className="space-y-1 ml-3">
              <li>• 本站新增 / 修改 / 刪除的行事曆活動自動同步至 Google Calendar</li>
              <li>• 在 Google Calendar 修改後自動反映至本站（雙向同步）</li>
              <li>• 在「基智行政平台」專用日曆中集中管理學校活動</li>
              <li>• 支援以 Gmail 登入 或 獨立授權 Google 帳號</li>
            </ul>
          </div>

          <button
            onClick={handleConnect}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            連結 Google Calendar
          </button>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 text-sm text-white shadow-lg transition-all ${
            toast.ok ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────

function StatCard({
  label,
  value,
  colorClass,
}: {
  label: string
  value: number | string
  colorClass: string
}) {
  return (
    <div className="rounded-lg bg-gray-50 p-3 text-center">
      <p className={`text-xl font-bold ${colorClass}`}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{label}</p>
    </div>
  )
}
