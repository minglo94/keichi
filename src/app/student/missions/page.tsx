"use client"

import { useEffect, useState } from "react"
import type { AiQuizMissionContent, PromptMissionContent, VideoMissionContent, FormMissionContent } from "@/types/mission"
import { fetchArray } from "@/lib/fetch-json"

type SubmissionStatus = "PENDING" | "APPROVED" | "REJECTED"
type MissionStatus = "LOCKED" | "AVAILABLE" | "PENDING" | "DONE"

type Mission = {
  id: string
  title: string
  type: "VIDEO" | "FORM" | "AI_QUIZ" | "PROMPT"
  difficulty: "BASIC" | "ADVANCED" | "CHALLENGE"
  pointsReward: number
  prereqId: string | null
  order: number
  content: Record<string, unknown>
  submissions: { status: SubmissionStatus }[]
}

type ClassInfo = { id: string; name: string }

const difficultyColors: Record<string, string> = {
  BASIC: "bg-green-100 text-green-700",
  ADVANCED: "bg-yellow-100 text-yellow-700",
  CHALLENGE: "bg-red-100 text-red-700",
}

const typeLabels: Record<string, string> = {
  VIDEO: "影片",
  FORM: "表單",
  AI_QUIZ: "AI 測驗",
  PROMPT: "Prompt",
}

export default function MissionsPage() {
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [activeClass, setActiveClass] = useState<ClassInfo | null>(null)
  const [missions, setMissions] = useState<Mission[]>([])
  const [selected, setSelected] = useState<Mission | null>(null)
  const [approvedIds, setApprovedIds] = useState<Set<string>>(new Set())

  // Quiz state
  const [quizAnswers, setQuizAnswers] = useState<number[]>([])
  const [quizScore, setQuizScore] = useState<number | null>(null)
  const [promptText, setPromptText] = useState("")
  const [promptResult, setPromptResult] = useState<{ score?: number; feedback?: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchArray<ClassInfo>("/api/classes").then((data) => {
      setClasses(data)
      if (data.length > 0) setActiveClass(data[0])
    })
  }, [])

  useEffect(() => {
    if (!activeClass) return
    fetchArray<Mission>(`/api/classes/${activeClass.id}/missions`)
      .then((data) => {
        setMissions(data)
        const approved = new Set(
          data
            .filter((m) => m.submissions[0]?.status === "APPROVED")
            .map((m) => m.id)
        )
        setApprovedIds(approved)
      })
  }, [activeClass])

  const getMissionStatus = (mission: Mission): MissionStatus => {
    const sub = mission.submissions[0]
    if (sub?.status === "APPROVED") return "DONE"
    if (sub?.status === "PENDING") return "PENDING"
    if (mission.prereqId && !approvedIds.has(mission.prereqId)) return "LOCKED"
    return "AVAILABLE"
  }

  const nodeStyle = (status: MissionStatus) => {
    switch (status) {
      case "DONE": return "bg-green-500 text-white border-green-600"
      case "PENDING": return "bg-orange-400 text-white border-orange-500"
      case "AVAILABLE": return "bg-blue-500 text-white border-blue-600 cursor-pointer hover:bg-blue-600"
      case "LOCKED": return "bg-gray-200 text-gray-400 border-gray-300 cursor-not-allowed"
    }
  }

  const openMission = (mission: Mission) => {
    const status = getMissionStatus(mission)
    if (status === "LOCKED") return
    setSelected(mission)
    setQuizAnswers([])
    setQuizScore(null)
    setPromptText("")
    setPromptResult(null)
  }

  const submitQuiz = async () => {
    if (!selected || !activeClass) return
    const content = selected.content as AiQuizMissionContent
    let correct = 0
    content.questions.forEach((q, i) => {
      if (quizAnswers[i] === q.answer) correct++
    })
    const score = Math.round((correct / content.questions.length) * 100)
    setQuizScore(score)

    if (score >= content.passScore) {
      setSubmitting(true)
      await fetch(`/api/missions/${selected.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: { answers: quizAnswers, score, timeSpentSec: 0 } }),
      })
      setSubmitting(false)
      refreshMissions()
    }
  }

  const testPrompt = async () => {
    if (!selected || !promptText) return
    setSubmitting(true)
    const res = await fetch("/api/ai/evaluate-prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promptText, missionContent: selected.content }),
    })
    if (res.ok) {
      const data = await res.json()
      setPromptResult(data)
    }
    setSubmitting(false)
  }

  const submitPrompt = async () => {
    if (!selected) return
    setSubmitting(true)
    await fetch(`/api/missions/${selected.id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: { promptText } }),
    })
    setSubmitting(false)
    setSelected(null)
    refreshMissions()
  }

  const submitForm = async () => {
    if (!selected) return
    setSubmitting(true)
    await fetch(`/api/missions/${selected.id}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: { selfReported: true } }),
    })
    setSubmitting(false)
    setSelected(null)
    refreshMissions()
  }

  const refreshMissions = () => {
    if (!activeClass) return
    fetchArray<Mission>(`/api/classes/${activeClass.id}/missions`)
      .then((data) => {
        setMissions(data)
        const approved = new Set(
          data
            .filter((m) => m.submissions[0]?.status === "APPROVED")
            .map((m) => m.id)
        )
        setApprovedIds(approved)
      })
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {classes.length > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {classes.map((cls) => (
            <button
              key={cls.id}
              onClick={() => setActiveClass(cls)}
              className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${
                activeClass?.id === cls.id ? "bg-blue-600 text-white" : "bg-white text-gray-600 border"
              }`}
            >
              {cls.name}
            </button>
          ))}
        </div>
      )}

      <h2 className="font-bold text-lg mb-4">衝關地圖</h2>

      {missions.length === 0 ? (
        <div className="text-center text-gray-400 py-12">暫無任務</div>
      ) : (
        <div className="relative">
          {missions.map((mission, idx) => {
            const status = getMissionStatus(mission)
            return (
              <div key={mission.id} className="flex items-start gap-4 mb-6">
                <div className="flex flex-col items-center">
                  <button
                    onClick={() => openMission(mission)}
                    className={`w-12 h-12 rounded-full border-2 flex items-center justify-center text-lg font-bold transition-all ${nodeStyle(status)}`}
                  >
                    {status === "DONE" ? "✓" : status === "LOCKED" ? "🔒" : status === "PENDING" ? "⏳" : idx + 1}
                  </button>
                  {idx < missions.length - 1 && (
                    <div className="w-0.5 h-8 bg-gray-200 mt-1" />
                  )}
                </div>
                <div
                  className={`flex-1 bg-white rounded-2xl p-4 border shadow-sm ${status === "AVAILABLE" ? "cursor-pointer hover:border-blue-300" : ""}`}
                  onClick={() => openMission(mission)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-sm">{mission.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${difficultyColors[mission.difficulty]}`}>
                      {mission.difficulty === "BASIC" ? "基礎" : mission.difficulty === "ADVANCED" ? "進階" : "挑戰"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs text-gray-400">{typeLabels[mission.type]}</span>
                    <span className="text-xs text-yellow-600 font-medium">+{mission.pointsReward}分</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Mission Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={() => setSelected(null)}>
          <div
            className="bg-white rounded-t-3xl w-full max-h-[85vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-4">
              <h2 className="font-bold text-lg pr-4">{selected.title}</h2>
              <button onClick={() => setSelected(null)} className="text-gray-400 text-2xl leading-none">×</button>
            </div>

            {selected.type === "AI_QUIZ" && (
              <div>
                {quizScore !== null ? (
                  <div className="text-center py-4">
                    <div className="text-4xl font-bold mb-2">{quizScore}分</div>
                    <p className="text-gray-500 text-sm">
                      {quizScore >= (selected.content as AiQuizMissionContent).passScore
                        ? "恭喜過關！等待老師批核"
                        : `未達合格線 ${(selected.content as AiQuizMissionContent).passScore} 分，再試一次`}
                    </p>
                    {quizScore < (selected.content as AiQuizMissionContent).passScore && (
                      <button
                        onClick={() => { setQuizAnswers([]); setQuizScore(null) }}
                        className="mt-3 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm"
                      >
                        再試
                      </button>
                    )}
                  </div>
                ) : (
                  <div>
                    {(selected.content as AiQuizMissionContent).questions.map((q, qi) => (
                      <div key={q.id} className="mb-6">
                        <p className="font-medium text-sm mb-3">{qi + 1}. {q.question}</p>
                        <div className="grid grid-cols-1 gap-2">
                          {q.options.map((opt, oi) => (
                            <button
                              key={oi}
                              onClick={() => setQuizAnswers((prev) => { const a = [...prev]; a[qi] = oi; return a })}
                              className={`text-left px-4 py-3 rounded-xl border text-sm transition-colors ${
                                quizAnswers[qi] === oi ? "bg-blue-600 text-white border-blue-600" : "hover:bg-gray-50"
                              }`}
                            >
                              {String.fromCharCode(65 + oi)}. {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={submitQuiz}
                      disabled={quizAnswers.length < (selected.content as AiQuizMissionContent).questions.length || submitting}
                      className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium disabled:opacity-50"
                    >
                      提交答案
                    </button>
                  </div>
                )}
              </div>
            )}

            {selected.type === "PROMPT" && (
              <div>
                <div className="bg-gray-50 rounded-xl p-4 mb-4">
                  <p className="text-sm text-gray-700">{(selected.content as PromptMissionContent).scenario}</p>
                </div>
                {(selected.content as PromptMissionContent).template && (
                  <div className="bg-blue-50 rounded-xl p-3 mb-4 text-xs text-blue-700">
                    範本：{(selected.content as PromptMissionContent).template}
                  </div>
                )}
                <textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder="在此輸入你的 Prompt..."
                  rows={5}
                  className="w-full border rounded-xl p-3 text-sm mb-3 resize-none"
                />
                {promptResult && (
                  <div className="bg-gray-50 rounded-xl p-4 mb-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-xl">{promptResult.score}</span>
                      <span className="text-gray-500 text-sm">/ 100</span>
                    </div>
                    <p className="text-sm text-gray-600">{promptResult.feedback}</p>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={testPrompt}
                    disabled={!promptText || submitting}
                    className="flex-1 border border-blue-600 text-blue-600 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
                  >
                    測試 Prompt
                  </button>
                  <button
                    onClick={submitPrompt}
                    disabled={!promptText || submitting}
                    className="flex-1 bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium disabled:opacity-50"
                  >
                    正式提交
                  </button>
                </div>
              </div>
            )}

            {selected.type === "VIDEO" && (
              <div>
                <div className="aspect-video rounded-xl overflow-hidden mb-4 bg-black">
                  <iframe
                    src={`https://www.youtube.com/embed/${(selected.content as VideoMissionContent).youtubeId}`}
                    className="w-full h-full"
                    allowFullScreen
                  />
                </div>
                <button
                  onClick={submitForm}
                  disabled={submitting}
                  className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium"
                >
                  我已完成觀看
                </button>
              </div>
            )}

            {selected.type === "FORM" && (
              <div>
                <a
                  href={(selected.content as FormMissionContent).formUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full text-center bg-gray-100 border py-3 rounded-xl text-sm mb-4"
                >
                  開啟表單
                </a>
                <label className="flex items-center gap-2 text-sm mb-4">
                  <input type="checkbox" id="selfReport" className="rounded" />
                  <span>我已完成表單填寫</span>
                </label>
                <button
                  onClick={submitForm}
                  disabled={submitting}
                  className="w-full bg-blue-600 text-white py-3 rounded-xl font-medium"
                >
                  確認提交
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
