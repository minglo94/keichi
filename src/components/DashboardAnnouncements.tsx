"use client"

import { useEffect, useState } from "react"

type Announcement = {
  id: string
  title: string
  body: string
  priority: "NORMAL" | "IMPORTANT" | "URGENT"
  publishAt: string
  createdAt: string
}

export function DashboardAnnouncements() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)

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

  if (loading || announcements.length === 0) return null

  return (
    <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">📢</span>
        <h3 className="font-semibold text-amber-900">今日公告</h3>
      </div>
      <div className="space-y-3">
        {announcements.map(ann => (
          <div key={ann.id} className={`border-l-4 pl-3 py-1 ${
            ann.priority === 'URGENT' ? 'border-red-500 bg-red-50/50' : 
            ann.priority === 'IMPORTANT' ? 'border-amber-400' : 'border-amber-300'
          }`}>
            <div className="flex items-center gap-2">
              {ann.priority === 'URGENT' && <span className="animate-pulse">🚨</span>}
              <h4 className={`text-sm font-bold ${ann.priority === 'URGENT' ? 'text-red-900' : 'text-amber-900'}`}>{ann.title}</h4>
            </div>
            <p className={`text-xs line-clamp-2 ${ann.priority === 'URGENT' ? 'text-red-800' : 'text-amber-800'}`}>{ann.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
