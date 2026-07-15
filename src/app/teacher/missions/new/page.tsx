"use client"

import { useState, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import type { AiQuizGenerationResponse } from "@/types/mission"

type MissionType = "VIDEO" | "FORM" | "AI_QUIZ" | "PROMPT"
type Difficulty = "BASIC" | "ADVANCED" | "CHALLENGE"

const TYPE_INFO = [
  { type: "AI_QUIZ" as MissionType, icon: "🤖", label: "AI 測驗", desc: "Claude 自動生成選擇題" },
  { type: "PROMPT" as MissionType, icon: "✍️", label: "Prompt 挑戰", desc: "學生撰寫 Prompt 並獲 AI 評分" },
  { type: "VIDEO" as MissionType, icon: "🎬", label: "影片任務", desc: "觀看 YouTube 影片" },
  { type: "FORM" as MissionType, icon: "📝", label: "表單任務", desc: "填寫 Google Forms" },
]

function NewMissionForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const classId = searchParams.get("classId") ?? ""

  const [step, setStep] = useState(1)
  const [type, setType] = useState<MissionType | null>(null)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [difficulty, setDifficulty] = useState<Difficulty>("BASIC")
  const [pointsReward, setPointsReward] = useState(100)
  const [order, setOrder] = useState(0)
  const [publishNow, setPublishNow] = useState(false)

  // AI_QUIZ fields
  const [sourceText, setSourceText] = useState("")
  const [quizCount, setQuizCount] = useState(5)
  const [generatedQuiz, setGeneratedQuiz] = useState<AiQuizGenerationResponse | null>(null)
  const [passScore, setPassScore] = useState(70)
  const [generating, setGenerating] = useState(false)

  // PROMPT fields
  const [scenario, setScenario] = useState("")
  const [rubric, setRubric] = useState("")
  const [promptLevel, setPromptLevel] = useState<"FILL_IN" | "IMPROVE" | "FREE">("FREE")

  // VIDEO fields
  const [youtubeId, setYoutubeId] = useState("")
  const [minWatchPct, setMinWatchPct] = useState(80)

  // FORM fields
  const [formUrl, setFormUrl] = useState("")

  const [saving, setSaving] = useState(false)

  const generateQuiz = async () => {
    if (sourceText.length < 50) return
    setGenerating(true)
    const res = await fetch("/api/ai/generate-quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceText, count: quizCount, difficulty }),
    })
    if (res.ok) {
      setGeneratedQuiz(await res.json())
    }
    setGenerating(false)
  }

  const buildContent = () => {
    switch (type) {
      case "AI_QUIZ":
        return { ...generatedQuiz, passScore, generatedBy: "claude-sonnet-4-5", sourceType: "TEXT" }
      case "PROMPT":
        return { scenario, rubric, level: promptLevel }
      case "VIDEO":
        return { youtubeId, checkpoints: [], minWatchPct }
      case "FORM":
        return { formUrl, completionMode: "SELF_REPORT" }
    }
  }

  const save = async (publish: boolean) => {
    if (!type || !title || !classId) return
    setSaving(true)
    const res = await fetch(`/api/classes/${classId}/missions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description,
        type,
        content: buildContent(),
        difficulty,
        pointsReward,
        order,
        status: publish ? "PUBLISHED" : "DRAFT",
      }),
    })
    if (res.ok) {
      router.push("/teacher/missions")
    }
    setSaving(false)
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-400">←</button>
        <h2 className="font-bold text-lg">新增任務</h2>
      </div>

      {/* Step indicators */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
              step >= s ? "bg-green-600 text-white" : "bg-gray-100 text-gray-400"
            }`}>{s}</div>
            {s < 3 && <div className="flex-1 h-0.5 w-8 bg-gray-100" />}
          </div>
        ))}
        <div className="ml-2 text-sm text-gray-500">
          {step === 1 ? "選擇類型" : step === 2 ? "填寫內容" : "設定選項"}
        </div>
      </div>

      {/* Step 1: Type */}
      {step === 1 && (
        <div className="grid grid-cols-2 gap-3">
          {TYPE_INFO.map((t) => (
            <button
              key={t.type}
              onClick={() => { setType(t.type); setStep(2) }}
              className="bg-white border-2 rounded-2xl p-4 text-left hover:border-green-400 transition-colors"
            >
              <div className="text-3xl mb-2">{t.icon}</div>
              <div className="font-semibold text-sm">{t.label}</div>
              <div className="text-xs text-gray-500 mt-1">{t.desc}</div>
            </button>
          ))}
        </div>
      )}

      {/* Step 2: Content */}
      {step === 2 && type && (
        <div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="任務標題"
            className="w-full border rounded-xl px-3 py-2.5 text-sm mb-3"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="任務描述（可選）"
            rows={2}
            className="w-full border rounded-xl px-3 py-2.5 text-sm mb-4 resize-none"
          />

          {type === "AI_QUIZ" && (
            <div>
              <textarea
                value={sourceText}
                onChange={(e) => setSourceText(e.target.value)}
                placeholder="貼入教材文字（最少 50 字）"
                rows={6}
                className="w-full border rounded-xl px-3 py-2.5 text-sm mb-2 resize-none"
              />
              <div className="flex gap-2 mb-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">題目數量</label>
                  <input
                    type="number"
                    value={quizCount}
                    onChange={(e) => setQuizCount(Number(e.target.value))}
                    min={3}
                    max={10}
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-500 mb-1 block">合格分數</label>
                  <input
                    type="number"
                    value={passScore}
                    onChange={(e) => setPassScore(Number(e.target.value))}
                    min={50}
                    max={100}
                    className="w-full border rounded-xl px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <button
                onClick={generateQuiz}
                disabled={sourceText.length < 50 || generating}
                className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium mb-4 disabled:opacity-50"
              >
                {generating ? "AI 出題中..." : "AI 出題"}
              </button>
              {generatedQuiz && (
                <div className="bg-gray-50 rounded-xl p-3 mb-3">
                  <p className="text-xs text-gray-500 mb-2">已生成 {generatedQuiz.questions.length} 題：</p>
                  {generatedQuiz.questions.map((q, i) => (
                    <p key={q.id} className="text-xs text-gray-700 mb-1">{i + 1}. {q.question}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {type === "PROMPT" && (
            <div>
              <textarea
                value={scenario}
                onChange={(e) => setScenario(e.target.value)}
                placeholder="任務情境（顯示給學生）"
                rows={3}
                className="w-full border rounded-xl px-3 py-2.5 text-sm mb-2 resize-none"
              />
              <textarea
                value={rubric}
                onChange={(e) => setRubric(e.target.value)}
                placeholder="評分標準（發給 AI 評分員）"
                rows={3}
                className="w-full border rounded-xl px-3 py-2.5 text-sm mb-2 resize-none"
              />
              <div>
                <label className="text-xs text-gray-500 mb-1 block">難度層次</label>
                <select
                  value={promptLevel}
                  onChange={(e) => setPromptLevel(e.target.value as "FILL_IN" | "IMPROVE" | "FREE")}
                  className="w-full border rounded-xl px-3 py-2 text-sm"
                >
                  <option value="FREE">自由撰寫</option>
                  <option value="FILL_IN">填充模板</option>
                  <option value="IMPROVE">改進範例</option>
                </select>
              </div>
            </div>
          )}

          {type === "VIDEO" && (
            <div>
              <input
                value={youtubeId}
                onChange={(e) => setYoutubeId(e.target.value)}
                placeholder="YouTube 影片 ID（如：dQw4w9WgXcQ）"
                className="w-full border rounded-xl px-3 py-2.5 text-sm mb-2"
              />
              <div>
                <label className="text-xs text-gray-500 mb-1 block">最低觀看比例 {minWatchPct}%</label>
                <input
                  type="range"
                  value={minWatchPct}
                  onChange={(e) => setMinWatchPct(Number(e.target.value))}
                  min={10}
                  max={100}
                  className="w-full"
                />
              </div>
            </div>
          )}

          {type === "FORM" && (
            <input
              value={formUrl}
              onChange={(e) => setFormUrl(e.target.value)}
              placeholder="Google Forms 連結"
              className="w-full border rounded-xl px-3 py-2.5 text-sm"
            />
          )}

          <button
            onClick={() => setStep(3)}
            disabled={!title}
            className="w-full bg-green-600 text-white py-3 rounded-xl font-medium mt-4 disabled:opacity-50"
          >
            下一步
          </button>
        </div>
      )}

      {/* Step 3: Settings */}
      {step === 3 && (
        <div>
          <div className="mb-4">
            <label className="text-xs text-gray-500 mb-1 block">難度</label>
            <div className="flex gap-2">
              {(["BASIC", "ADVANCED", "CHALLENGE"] as Difficulty[]).map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`flex-1 py-2 rounded-xl text-sm ${
                    difficulty === d ? "bg-green-600 text-white" : "border text-gray-600"
                  }`}
                >
                  {d === "BASIC" ? "基礎" : d === "ADVANCED" ? "進階" : "挑戰"}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-4">
            <label className="text-xs text-gray-500 mb-1 block">積點獎勵</label>
            <input
              type="number"
              value={pointsReward}
              onChange={(e) => setPointsReward(Number(e.target.value))}
              min={10}
              max={500}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div className="mb-6">
            <label className="text-xs text-gray-500 mb-1 block">排序順序</label>
            <input
              type="number"
              value={order}
              onChange={(e) => setOrder(Number(e.target.value))}
              min={0}
              className="w-full border rounded-xl px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => save(false)}
              disabled={saving}
              className="flex-1 border border-green-600 text-green-600 py-3 rounded-xl font-medium disabled:opacity-50"
            >
              儲存草稿
            </button>
            <button
              onClick={() => save(true)}
              disabled={saving}
              className="flex-1 bg-green-600 text-white py-3 rounded-xl font-medium disabled:opacity-50"
            >
              發佈任務
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function NewMissionPage() {
  return (
    <Suspense fallback={<div className="p-4 text-center">載入中...</div>}>
      <NewMissionForm />
    </Suspense>
  )
}
