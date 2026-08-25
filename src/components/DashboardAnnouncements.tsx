"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"

type Announcement = {
  id: string
  title: string
  body: string
  priority: "NORMAL" | "IMPORTANT" | "URGENT"
  publishAt: string
  createdAt: string
}

export function DashboardAnnouncements() {
  const { data: session } = useSession()
  // Staff get a link through to the full 公告 page; students have no such page,
  // so for them the card expands in place instead.
  const isStaff = ["TEACHER", "ADMIN"].includes(
    (session?.user as { role?: string } | undefined)?.role ?? ""
  )

  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch("/api/announcements")
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (!Array.isArray(data)) { setLoading(false); return }
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)

        // Filter for announcements scheduled for today (or before if we want to show all active)
        // User asked "can it choose the the date of posting", implying they want to see notices for a specific date.
        // Let's show notices that are published between today 00:00 and tomorrow 00:00.
        const filtered = data.filter((a: any) => {
          const pubDate = new Date(a.publishAt || a.createdAt)
          return pubDate >= today && pubDate < tomorrow
        })
        setAnnouncements(filtered)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  if (loading || announcements.length === 0) return null

  return (
    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">📢</span>
          <h3 className="font-semibold text-amber-900">今日公告</h3>
        </div>
        {isStaff && (
          <Link href="/teacher/announcements" className="text-xs font-medium text-amber-800 hover:underline shrink-0">
            查看全部 →
          </Link>
        )}
      </div>
      <div className="space-y-3">
        {announcements.map(ann => {
          const urgent = ann.priority === 'URGENT'
          const isOpen = expanded.has(ann.id)
          const titleCls = `text-sm font-bold ${urgent ? 'text-red-900' : 'text-amber-900'} hover:underline text-left`

          return (
            <div key={ann.id} className={`border-l-4 pl-3 py-1 ${
              urgent ? 'border-red-500 bg-red-50/50' :
              ann.priority === 'IMPORTANT' ? 'border-amber-400' : 'border-amber-300'
            }`}>
              <div className="flex items-center gap-2">
                {urgent && <span className="animate-pulse">🚨</span>}
                {isStaff ? (
                  <Link href={`/teacher/announcements#ann-${ann.id}`} className={titleCls}>
                    {ann.title}
                  </Link>
                ) : (
                  <button onClick={() => toggle(ann.id)} className={titleCls}>
                    {ann.title}
                  </button>
                )}
              </div>
              <p
                className={`text-xs ${isOpen ? 'whitespace-pre-wrap' : 'line-clamp-2'} ${urgent ? 'text-red-800' : 'text-amber-800'}`}
              >
                {ann.body}
              </p>
              {!isStaff && (
                <button
                  onClick={() => toggle(ann.id)}
                  className={`text-[11px] font-medium mt-0.5 ${urgent ? 'text-red-700' : 'text-amber-700'} hover:underline`}
                >
                  {isOpen ? "收起" : "閱讀全文"}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
