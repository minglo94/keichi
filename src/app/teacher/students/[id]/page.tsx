"use client"

import { useState, useEffect } from "react"
import { useParams } from "next/navigation"
import { User, Award, BookOpen, Calendar, ShieldAlert, Download, TrendingUp } from "lucide-react"

export default function StudentPortfolioPage() {
  const { id } = useParams()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPortfolio()
  }, [id])

  const fetchPortfolio = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/students/${id}/portfolio`)
      const json = await res.json()
      setData(json)
    } catch (error) {
      console.error("Failed to fetch portfolio:", error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="p-8 text-center">載入中...</div>
  if (!data) return <div className="p-8 text-center text-red-500">找不到學生資料</div>

  const { student, stats, submissions, activities, points, behavior } = data

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-2xl font-bold">
            {student.name[0]}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{student.name}</h1>
            <p className="text-gray-500">{student.email}</p>
          </div>
        </div>
        <button className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800 transition-colors">
          <Download className="w-5 h-5" />
          匯出個人檔案 (PDF)
        </button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center text-amber-600">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm text-gray-500">累積積點</div>
            <div className="text-2xl font-bold">{stats.totalPoints}</div>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center text-green-600">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm text-gray-500">任務完成數</div>
            <div className="text-2xl font-bold">{stats.completedMissions}</div>
          </div>
        </div>
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="text-sm text-gray-500">平均出席率</div>
            <div className="text-2xl font-bold">{Math.round(stats.attendanceRate)}%</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Missions */}
        <div className="card overflow-hidden">
          <div className="p-4 bg-gray-50 border-b font-bold flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-gray-400" />
            衝關進度
          </div>
          <div className="divide-y max-h-[400px] overflow-y-auto">
            {submissions.map((s: any) => (
              <div key={s.id} className="p-4 flex justify-between items-center">
                <div>
                  <div className="font-medium text-sm">{s.mission.title}</div>
                  <div className="text-xs text-gray-500">{new Date(s.submittedAt).toLocaleDateString()}</div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  s.status === "APPROVED" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                }`}>
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Behavior */}
        <div className="card overflow-hidden">
          <div className="p-4 bg-gray-50 border-b font-bold flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-gray-400" />
            行為記錄
          </div>
          <div className="divide-y max-h-[400px] overflow-y-auto">
            {behavior.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">暫無記錄</div>
            ) : behavior.map((b: any) => (
              <div key={b.id} className="p-4">
                <div className="flex justify-between items-start mb-1">
                  <div className={`text-xs font-bold ${b.type === "MERIT" ? "text-green-600" : "text-red-600"}`}>
                    {b.type}
                  </div>
                  <div className="text-xs text-gray-500">{new Date(b.date).toLocaleDateString()}</div>
                </div>
                <div className="text-sm">{b.description}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
