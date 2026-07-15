"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

type Mission = {
  id: string
  title: string
  type: string
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED"
  difficulty: string
  pointsReward: number
  order: number
  submissions: { id: string; status: string }[]
}

type ClassInfo = { id: string; name: string }

const typeLabels: Record<string, string> = {
  VIDEO: "影片",
  FORM: "表單",
  AI_QUIZ: "AI 測驗",
  PROMPT: "Prompt",
}

export default function TeacherMissionsPage() {
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [activeClass, setActiveClass] = useState<ClassInfo | null>(null)
  const [missions, setMissions] = useState<Mission[]>([])

  useEffect(() => {
    fetch("/api/classes").then((r) => r.json()).then((data: ClassInfo[]) => {
      setClasses(data)
      if (data.length > 0) setActiveClass(data[0])
    })
  }, [])

  useEffect(() => {
    if (!activeClass) return
    fetch(`/api/classes/${activeClass.id}/missions`)
      .then((r) => r.json())
      .then(setMissions)
  }, [activeClass])

  const toggleStatus = async (mission: Mission) => {
    const newStatus = mission.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED"
    const res = await fetch(`/api/missions/${mission.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    })
    if (res.ok) {
      setMissions((prev) => prev.map((m) => m.id === mission.id ? { ...m, status: newStatus } : m))
    }
  }

  const pendingCount = missions.reduce(
    (sum, m) => sum + m.submissions.filter((s) => s.status === "PENDING").length, 0
  )

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-lg">任務管理</h2>
        {activeClass && (
          <Link
            href={`/teacher/missions/new?classId=${activeClass.id}`}
            className="bg-green-600 text-white px-3 py-1.5 rounded-xl text-sm"
          >
            新增任務
          </Link>
        )}
      </div>

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

      {pendingCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-3 mb-4 flex items-center gap-2">
          <span className="text-orange-500">⚠️</span>
          <span className="text-sm text-orange-700">{pendingCount} 份提交待審批</span>
        </div>
      )}

      {missions.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          {activeClass ? "尚無任務，點擊新增" : "請先建立班級"}
        </div>
      ) : (
        <div className="space-y-3">
          {missions.map((mission) => {
            const pending = mission.submissions.filter((s) => s.status === "PENDING").length
            return (
              <div key={mission.id} className="bg-white rounded-2xl p-4 border shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm truncate">{mission.title}</h3>
                      {pending > 0 && (
                        <span className="bg-orange-100 text-orange-600 text-xs px-1.5 py-0.5 rounded-full shrink-0">
                          {pending} 待審
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{typeLabels[mission.type]}</span>
                      <span>·</span>
                      <span>+{mission.pointsReward}分</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {pending > 0 && (
                      <Link
                        href={`/teacher/missions/${mission.id}/submissions`}
                        className="text-xs bg-orange-500 text-white px-2 py-1 rounded-lg"
                      >
                        審批
                      </Link>
                    )}
                    <button
                      onClick={() => toggleStatus(mission)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        mission.status === "PUBLISHED" ? "bg-green-500" : "bg-gray-200"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                          mission.status === "PUBLISHED" ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
