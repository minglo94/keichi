"use client"

import { useEffect, useState, useCallback } from "react"
import { useSession } from "next-auth/react"
import { getPusherClient } from "@/lib/pusher-client"
import type { PusherPointsAwardedPayload, PusherMissionApprovedPayload } from "@/types/mission"
import { DashboardAnnouncements } from "@/components/DashboardAnnouncements"
import { UnifiedTimeline } from "@/components/UnifiedTimeline"

type ClassInfo = { id: string; name: string; classCode: string }
type LeaderboardEntry = { rank: number; user: { id: string; name: string }; totalPoints: number }

type UpcomingActivity = {
  id:        string
  title:     string
  startTime: string
  endTime:   string | null
  location:  string | null
  assignments: { status: string }[]
}

function formatActivityTime(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth()+1}月${d.getDate()}日 ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`
}

export default function StudentDashboard() {
  const { data: session } = useSession()
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [activeClass, setActiveClass] = useState<ClassInfo | null>(null)
  const [points, setPoints] = useState(0)
  const [rank, setRank] = useState<number | null>(null)
  const [dueCount, setDueCount] = useState(0)
  const [toast, setToast] = useState<string | null>(null)
  const [joining, setJoining] = useState(false)
  const [classCode, setClassCode] = useState("")
  const [timelineItems, setTimelineItems] = useState<any[]>([])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const fetchLeaderboard = useCallback(async (classId: string, userId?: string) => {
    const res = await fetch(`/api/classes/${classId}/points`)
    if (res.ok) {
      const data: LeaderboardEntry[] = await res.json()
      if (userId) {
        const me = data.find((e) => e.user?.id === userId)
        if (me) {
          setPoints(me.totalPoints)
          setRank(me.rank)
        } else {
          setPoints(0)
          setRank(null)
        }
      }
    }
  }, [])

  useEffect(() => {
    fetch("/api/classes").then((r) => r.json()).then((data: ClassInfo[]) => {
      setClasses(data)
      if (data.length > 0) setActiveClass(data[0])
    })
  }, [])

  useEffect(() => {
    if (!activeClass) return
    fetchLeaderboard(activeClass.id, session?.user?.id)
  }, [activeClass, session?.user?.id, fetchLeaderboard])

  useEffect(() => {
    // Count due flashcards
    fetch("/api/flashcard-decks")
      .then((r) => r.json())
      .then(async (decks: { id: string }[]) => {
        let total = 0
        for (const deck of decks) {
          const res = await fetch(`/api/flashcard-decks/${deck.id}/due`)
          if (res.ok) {
            const cards = await res.json()
            total += cards.length
          }
        }
        setDueCount(total)
      })
  }, [])

  useEffect(() => {
    // Fetch unified timeline (Todos + Activities)
    Promise.all([
      fetch("/api/todos?view=assigned").then(r => r.ok ? r.json() : []),
      fetch("/api/activities").then(r => r.ok ? r.json() : [])
    ]).then(([todos, acts]) => {
      const items = [
        ...todos.map((t: any) => ({
          id: t.id,
          type: "TODO",
          title: t.title,
          date: t.dueDate || new Date().toISOString(),
          committee: t.committee
        })),
        ...acts.map((a: any) => ({
          id: a.id,
          type: "EVENT",
          title: a.title,
          date: a.startTime || new Date().toISOString(),
          committee: a.committee
        }))
      ]
      setTimelineItems(items)
    })
  }, [])

  // Pusher subscriptions ... (omitted for brevity in thinking but I'll keep them in code)
  useEffect(() => {
    if (!activeClass) return
    const pusher = getPusherClient()
    const channel = pusher.subscribe(`class-${activeClass.id}`)
    channel.bind("points-awarded", (data: PusherPointsAwardedPayload) => {
      showToast(`+${data.amount} 積點！`)
      fetchLeaderboard(activeClass.id, session?.user?.id)
    })
    channel.bind("mission-approved", (data: PusherMissionApprovedPayload) => {
      showToast(`任務批核！獲得 ${data.pointsAwarded} 積點`)
      fetchLeaderboard(activeClass.id, session?.user?.id)
    })
    return () => { channel.unbind_all(); pusher.unsubscribe(`class-${activeClass.id}`) }
  }, [activeClass, session?.user?.id, fetchLeaderboard])

  useEffect(() => {
    if (!session?.user?.id) return
    const pusher  = getPusherClient()
    const channel = pusher.subscribe(`private-user-${session.user.id}`)
    channel.bind("activity-alert", (data: { title: string; startTime: string; location?: string | null }) => {
      const loc = data.location ? ` 於 ${data.location}` : ""
      showToast(`📢 你有一個活動：${data.title} — ${formatActivityTime(data.startTime)}${loc}`)
    })
    return () => { channel.unbind_all(); pusher.unsubscribe(`private-user-${session.user.id}`) }
  }, [session?.user?.id])

  const handleJoin = async () => {
    if (classCode.length !== 6) return
    setJoining(true)
    const res = await fetch("/api/classes/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classCode }),
    })
    if (res.ok) {
      const data = await res.json()
      setClasses((prev) => [...prev, data.class])
      setActiveClass(data.class)
      setClassCode("")
      showToast("成功加入班級！")
    } else {
      const err = await res.json()
      showToast(err.error || "加入失敗")
    }
    setJoining(false)
  }

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg z-50 animate-bounce">
          {toast}
        </div>
      )}

      <DashboardAnnouncements />

      {classes.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 shadow-sm border text-center">
          <p className="text-gray-500 mb-4">你尚未加入任何班級</p>
          <div className="flex gap-2">
            <input
              value={classCode}
              onChange={(e) => setClassCode(e.target.value.toUpperCase())}
              placeholder="輸入班級代碼"
              maxLength={6}
              className="flex-1 border rounded-xl px-3 py-2 text-sm uppercase tracking-widest"
            />
            <button
              onClick={handleJoin}
              disabled={joining || classCode.length !== 6}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
            >
              加入
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm border text-center">
              <div className="text-2xl font-bold text-blue-600">{points}</div>
              <div className="text-xs text-gray-500 mt-1">積點</div>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm border text-center">
              <div className="text-2xl font-bold text-purple-600">#{rank ?? "—"}</div>
              <div className="text-xs text-gray-500 mt-1">排名</div>
            </div>
            <div className="bg-white rounded-2xl p-4 shadow-sm border text-center">
              <div className="text-2xl font-bold text-orange-500">{dueCount}</div>
              <div className="text-xs text-gray-500 mt-1">待複習</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border">
            <h2 className="font-semibold mb-3">快速入口</h2>
            <div className="grid grid-cols-2 gap-3">
              <a href="/student/missions" className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl">
                <span className="text-2xl">🗺️</span>
                <div>
                  <div className="text-sm font-medium">衝關地圖</div>
                  <div className="text-xs text-gray-500">賺積點</div>
                </div>
              </a>
              <a href="/student/flashcards" className="flex items-center gap-3 p-3 bg-orange-50 rounded-xl">
                <span className="text-2xl">🃏</span>
                <div>
                  <div className="text-sm font-medium">閃卡複習</div>
                  <div className="text-xs text-gray-500">{dueCount} 張待複習</div>
                </div>
              </a>
            </div>
          </div>

          <UnifiedTimeline initialItems={timelineItems} />

          <div className="bg-white rounded-2xl p-4 shadow-sm border">
            <h2 className="font-semibold mb-3">加入其他班級</h2>
            <div className="flex gap-2">
              <input
                value={classCode}
                onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                placeholder="輸入班級代碼"
                maxLength={6}
                className="flex-1 border rounded-xl px-3 py-2 text-sm uppercase tracking-widest"
              />
              <button
                onClick={handleJoin}
                disabled={joining || classCode.length !== 6}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
              >
                加入
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
