"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { fetchArray } from "@/lib/fetch-json"
import { isFormClassName } from "@/lib/form-class"

type ClassInfo = { id: string; name: string }
type LeaderboardEntry = {
  rank: number
  user: { id: string; name: string | null; image: string | null }
  totalPoints: number
}

const MEDAL = ["🥇", "🥈", "🥉"]

type Tx = { id: string; amount: number; reason: string; note: string | null; createdAt: string; class: { id: string; name: string } }

const REASON: Record<string, string> = {
  ATTENDANCE: "出席", MISSION: "完成任務", FLASHCARD: "溫習閃卡", TEACHER: "老師獎勵", REDEEM: "兌換",
}

export default function StudentPointsPage() {
  const { data: session } = useSession()
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [activeClass, setActiveClass] = useState<ClassInfo | null>(null)
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [history, setHistory] = useState<Tx[]>([])

  useEffect(() => {
    fetch("/api/me/points").then((r) => (r.ok ? r.json() : { history: [] })).then((d) => setHistory(d.history ?? []))
  }, [])

  // Fetch enrolled classes on mount
  useEffect(() => {
    fetchArray<ClassInfo>("/api/classes")
      .then((data) => {
        setClasses(data)
        // Points rank by form class — 課堂表現 from a 選修組 lands on the
        // student's own class — so open on that one.
        if (data.length > 0) setActiveClass(data.find((c) => isFormClassName(c.name)) ?? data[0])
      })
  }, [])

  // Fetch leaderboard when active class changes
  useEffect(() => {
    if (!activeClass) return
    setLoading(true)
    fetchArray<LeaderboardEntry>(`/api/classes/${activeClass.id}/points`)
      .then((data) => {
        setLeaderboard(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [activeClass])

  const myId = session?.user?.id
  const myEntry = leaderboard.find((e) => e.user?.id === myId)

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h2 className="font-bold text-lg mb-4" style={{ color: "var(--color-ink-900)" }}>
        積點排行榜
      </h2>

      {/* Class selector tabs */}
      {classes.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {classes.map((cls) => (
            <button
              key={cls.id}
              onClick={() => setActiveClass(cls)}
              className="px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors"
              style={
                activeClass?.id === cls.id
                  ? { background: "var(--color-accent)", color: "#fff" }
                  : { background: "var(--color-surface)", color: "var(--color-ink-700)", border: "1px solid var(--color-border)" }
              }
            >
              {cls.name}
            </button>
          ))}
        </div>
      )}

      {/* Hero card — student's own rank */}
      {myEntry ? (
        <div
          className="rounded-2xl p-5 mb-4 flex items-center gap-4"
          style={{ background: "var(--color-accent)", color: "#fff" }}
        >
          <div className="text-center shrink-0">
            <div className="text-4xl font-extrabold leading-none">
              {myEntry.rank <= 3 ? MEDAL[myEntry.rank - 1] : `#${myEntry.rank}`}
            </div>
            <div className="text-xs mt-1 opacity-80">排名</div>
          </div>
          <div className="flex-1">
            <div className="text-sm opacity-90 mb-0.5">{myEntry.user.name ?? "我"}</div>
            <div className="text-3xl font-extrabold leading-none">{myEntry.totalPoints.toLocaleString()}</div>
            <div className="text-xs mt-1 opacity-80">積點</div>
          </div>
        </div>
      ) : !loading && activeClass ? (
        <div
          className="rounded-2xl p-5 mb-4 text-center"
          style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
        >
          <div className="text-2xl mb-1">🌱</div>
          <div className="text-sm font-medium">你還沒有積點，課堂上積極表現、完成任務或複習閃卡都可以獲得積點！</div>
        </div>
      ) : null}

      {/* Leaderboard table */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}
      >
        <div
          className="px-4 py-3 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <span className="text-sm font-semibold" style={{ color: "var(--color-ink-900)" }}>
            全班排名
          </span>
          {leaderboard.length > 0 && (
            <span className="ml-2 text-xs" style={{ color: "var(--color-ink-300)" }}>
              {leaderboard.length} 人
            </span>
          )}
        </div>

        {loading ? (
          <div className="py-10 text-center text-sm" style={{ color: "var(--color-ink-300)" }}>
            載入中…
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: "var(--color-ink-300)" }}>
            暫無積點記錄
          </div>
        ) : (
          <ul>
            {leaderboard.map((entry) => {
              const isMe = entry.user?.id === myId
              return (
                <li
                  key={entry.user?.id ?? entry.rank}
                  className="flex items-center gap-3 px-4 py-3 border-b last:border-b-0"
                  style={{
                    borderColor: "var(--color-border)",
                    background: isMe ? "var(--color-accent-soft)" : undefined,
                  }}
                >
                  {/* Rank badge */}
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={
                      entry.rank === 1
                        ? { background: "#FBBF24", color: "#fff" }
                        : entry.rank === 2
                        ? { background: "#D1D5DB", color: "#374151" }
                        : entry.rank === 3
                        ? { background: "#F97316", color: "#fff" }
                        : { background: "var(--color-surface-2)", color: "var(--color-ink-500)" }
                    }
                  >
                    {entry.rank <= 3 ? MEDAL[entry.rank - 1] : entry.rank}
                  </span>

                  {/* Avatar */}
                  {entry.user?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={entry.user.image}
                      alt=""
                      width={28}
                      height={28}
                      className="rounded-full shrink-0"
                    />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-white text-xs font-semibold"
                      style={{ background: "var(--color-accent)" }}
                    >
                      {entry.user?.name?.[0]?.toUpperCase() ?? "?"}
                    </div>
                  )}

                  {/* Name */}
                  <span
                    className="flex-1 text-sm"
                    style={{
                      color: isMe ? "var(--color-accent)" : "var(--color-ink-900)",
                      fontWeight: isMe ? 600 : 400,
                    }}
                  >
                    {entry.user?.name ?? "未知用戶"}
                    {isMe && (
                      <span className="ml-1.5 text-xs" style={{ color: "var(--color-accent)" }}>
                        （我）
                      </span>
                    )}
                  </span>

                  {/* Points */}
                  <span
                    className="font-bold text-sm"
                    style={{
                      color: entry.totalPoints > 0 ? "var(--color-accent)" : "var(--color-ink-300)",
                    }}
                  >
                    {entry.totalPoints.toLocaleString()}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* 我的積點記錄 — every point earned or lost, with the teacher's note. */}
      <div className="rounded-2xl border overflow-hidden mt-4" style={{ background: "var(--color-surface)", borderColor: "var(--color-border)" }}>
        <div className="px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
          <span className="text-sm font-semibold" style={{ color: "var(--color-ink-900)" }}>我的積點記錄</span>
        </div>
        {history.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: "var(--color-ink-300)" }}>暫無記錄</div>
        ) : (
          <ul>
            {history.map((t) => (
              <li key={t.id} className="flex items-start gap-3 px-4 py-3 border-b last:border-b-0" style={{ borderColor: "var(--color-border)" }}>
                <span className="font-bold text-sm tabular-nums w-12 shrink-0 text-right"
                  style={{ color: t.amount > 0 ? "#15803d" : t.amount < 0 ? "#b91c1c" : "var(--color-ink-400)" }}>
                  {t.amount > 0 ? "+" : ""}{t.amount}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: "var(--color-ink-900)" }}>{t.note || REASON[t.reason] || t.reason}</p>
                  <p className="text-xs" style={{ color: "var(--color-ink-400)" }}>
                    {REASON[t.reason] ?? t.reason} · {t.class.name} · {new Date(t.createdAt).toLocaleDateString("zh-HK", { timeZone: "Asia/Hong_Kong" })}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
