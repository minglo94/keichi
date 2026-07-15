"use client"

import { CommitteeBadge } from "./teacher/CommitteeBadge"

type CommitteeType = "ADMIN" | "DISCIPLINE" | "IT" | "CURRICULUM" | "ECA"

type TimelineItem = {
  id: string
  type: "TODO" | "EVENT"
  title: string
  date: string
  committee?: CommitteeType | null
  status?: string
}

function formatDue(dateStr: string): string {
  const d = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff < 0)  return `逾期 ${Math.abs(diff)} 天`
  if (diff === 0) return "今天"
  if (diff === 1) return "明天"
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export function UnifiedTimeline({ initialItems }: { initialItems: TimelineItem[] }) {
  const sorted = [...initialItems]
    .filter(item => item.date && !isNaN(new Date(item.date).getTime()))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return (
    <div className="card p-5">
      <h2 className="text-h2 mb-4">即將行程 · Schedule</h2>
      <div className="space-y-3">
        {sorted.length === 0 ? (
          <p className="text-body py-6 text-center text-gray-400">暫無行程</p>
        ) : (
          sorted.map((item) => (
            <div key={`${item.type}-${item.id}`} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div className="flex flex-col items-center justify-center w-12 shrink-0">
                <span className="text-xs font-bold text-gray-500 uppercase">{new Date(item.date).toLocaleDateString('zh-HK', { weekday: 'short' })}</span>
                <span className="text-lg font-bold text-gray-900">{new Date(item.date).getDate()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${item.type === 'TODO' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                    {item.type}
                  </span>
                  {item.committee && <CommitteeBadge committee={item.committee} />}
                </div>
                <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                <p className="text-xs text-gray-500">{formatDue(item.date)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
