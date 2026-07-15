"use client"

import { useEffect, useState } from "react"

type ClassInfo = { id: string; name: string }
type Member = { id: string; name: string | null; image: string | null; email: string | null }
type LeaderboardEntry = { rank: number; user: { id: string; name: string; image: string | null }; totalPoints: number }

export default function TeacherPointsPage() {
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [activeClass, setActiveClass] = useState<ClassInfo | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [selectedUserId, setSelectedUserId] = useState("")
  const [amount, setAmount] = useState(10)
  const [note, setNote] = useState("")
  const [awarding, setAwarding] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const fetchData = async (classId: string) => {
    const [lbRes, membersRes] = await Promise.all([
      fetch(`/api/classes/${classId}/points`),
      fetch(`/api/classes/${classId}/members`),
    ])
    if (lbRes.ok) setLeaderboard(await lbRes.json())
    if (membersRes.ok) {
      const data = await membersRes.json()
      setMembers(data.map((e: any) => e.student))
    }
  }

  useEffect(() => {
    fetch("/api/classes").then((r) => r.json()).then((data: ClassInfo[]) => {
      setClasses(data)
      if (data.length > 0) setActiveClass(data[0])
    })
  }, [])

  useEffect(() => {
    if (activeClass) fetchData(activeClass.id)
  }, [activeClass])

  const award = async () => {
    if (!activeClass || !selectedUserId || amount < 1) return
    setAwarding(true)
    const res = await fetch(`/api/classes/${activeClass.id}/points`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId, amount, reason: "TEACHER", note }),
    })
    if (res.ok) {
      showToast(`成功發放 ${amount} 積點！`)
      setNote("")
      fetchData(activeClass.id)
    }
    setAwarding(false)
  }

  // Build a points map from leaderboard for quick lookup
  const pointsMap = Object.fromEntries(leaderboard.map((e) => [e.user.id, e.totalPoints]))
  const rankMap = Object.fromEntries(leaderboard.map((e) => [e.user.id, e.rank]))

  // All members sorted: those with points by rank, then 0-point members alphabetically
  const allMembersRanked = [
    ...leaderboard.map((e) => e.user),
    ...members.filter((m) => !pointsMap[m.id]),
  ]

  const rankStyle = (rank: number | undefined) => {
    if (rank === 1) return "bg-yellow-400 text-white"
    if (rank === 2) return "bg-gray-300 text-gray-700"
    if (rank === 3) return "bg-orange-300 text-white"
    return "bg-gray-100 text-gray-500"
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 bg-green-600 text-white px-4 py-2 rounded-full text-sm font-medium shadow-lg z-50">
          {toast}
        </div>
      )}

      <h2 className="font-bold text-lg mb-4">積點管理</h2>

      {classes.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {classes.map((cls) => (
            <button
              key={cls.id}
              onClick={() => setActiveClass(cls)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${
                activeClass?.id === cls.id ? "bg-green-600 text-white" : "bg-white text-gray-600 border"
              }`}
            >
              {cls.name}
            </button>
          ))}
        </div>
      )}

      {activeClass && (
        <>
          {/* Award widget */}
          <div className="bg-white rounded-2xl p-4 border shadow-sm mb-4">
            <h3 className="font-semibold text-sm mb-3">發放積點</h3>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full border rounded-xl px-3 py-2.5 text-sm mb-2"
            >
              <option value="">選擇學生</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.email ?? m.id}（{pointsMap[m.id] ?? 0} 分）
                </option>
              ))}
            </select>
            <div className="flex gap-2 mb-2">
              <div className="flex-1">
                <label className="text-xs text-gray-400 mb-1 block">積點數量</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  min={1}
                  max={200}
                  className="w-full border rounded-xl px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-400 mb-1 block">備注</label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="（可選）"
                  className="w-full border rounded-xl px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button
              onClick={award}
              disabled={!selectedUserId || awarding}
              className="w-full bg-green-600 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
            >
              立即發放
            </button>
          </div>

          {/* Leaderboard */}
          <div className="bg-white rounded-2xl p-4 border shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">全班排行榜</h3>
              <span className="text-xs text-gray-400">{members.length} 人</span>
            </div>
            {members.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-6">暫無學生</p>
            ) : (
              <div className="space-y-2">
                {allMembersRanked.map((u) => {
                  const rank = rankMap[u.id]
                  const pts = pointsMap[u.id] ?? 0
                  return (
                    <div
                      key={u.id}
                      className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer ${
                        selectedUserId === u.id ? "bg-green-50" : ""
                      }`}
                      onClick={() => setSelectedUserId(u.id)}
                    >
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${rankStyle(rank)}`}>
                        {rank ?? "—"}
                      </span>
                      <span className="flex-1 text-sm">{u.name}</span>
                      <span className={`font-bold text-sm ${pts > 0 ? "text-green-600" : "text-gray-300"}`}>
                        {pts}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
