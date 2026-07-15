"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"

type Submission = {
  id: string
  status: "PENDING" | "APPROVED" | "REJECTED"
  aiScore: number | null
  aiFeedback: string | null
  content: Record<string, unknown>
  submittedAt: string
  student: { id: string; name: string; image: string | null }
}

export default function SubmissionsPage({ params }: { params: { missionId: string } }) {
  const router = useRouter()
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [selected, setSelected] = useState<Submission | null>(null)
  const [feedback, setFeedback] = useState("")
  const [processing, setProcessing] = useState(false)

  const fetchSubmissions = useCallback(async () => {
    const res = await fetch(`/api/missions/${params.missionId}/submissions`)
    if (res.ok) setSubmissions(await res.json())
  }, [params.missionId])

  useEffect(() => { fetchSubmissions() }, [fetchSubmissions])

  const review = async (action: "APPROVE" | "REJECT") => {
    if (!selected) return
    setProcessing(true)
    const res = await fetch(`/api/submissions/${selected.id}/review`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, feedback }),
    })
    if (res.ok) {
      // Optimistic remove from pending list
      setSubmissions((prev) => prev.filter((s) => s.id !== selected.id))
      setSelected(null)
      setFeedback("")
    }
    setProcessing(false)
  }

  const pending = submissions.filter((s) => s.status === "PENDING")
  const reviewed = submissions.filter((s) => s.status !== "PENDING")

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <button onClick={() => router.back()} className="text-gray-400">←</button>
        <h2 className="font-bold text-lg">提交審批</h2>
        <span className="bg-orange-100 text-orange-600 text-xs px-2 py-0.5 rounded-full">
          {pending.length} 待審
        </span>
      </div>

      {pending.length === 0 && reviewed.length === 0 && (
        <div className="text-center text-gray-400 py-12">暫無提交</div>
      )}

      {pending.length > 0 && (
        <div className="mb-6">
          <h3 className="font-semibold text-sm text-gray-500 mb-2">待審批</h3>
          <div className="space-y-3">
            {pending.map((sub) => (
              <div
                key={sub.id}
                className="bg-white rounded-2xl p-4 border shadow-sm cursor-pointer hover:border-green-300"
                onClick={() => { setSelected(sub); setFeedback("") }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-sm">{sub.student.name}</span>
                  {sub.aiScore !== null && (
                    <span className={`text-sm font-bold ${sub.aiScore >= 70 ? "text-green-600" : "text-orange-500"}`}>
                      AI {sub.aiScore}分
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  {new Date(sub.submittedAt).toLocaleString("zh-HK")}
                </p>
                {sub.aiFeedback && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{sub.aiFeedback}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {reviewed.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm text-gray-500 mb-2">已審批</h3>
          <div className="space-y-2">
            {reviewed.map((sub) => (
              <div key={sub.id} className="bg-gray-50 rounded-2xl p-3 border flex items-center justify-between">
                <span className="text-sm">{sub.student.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  sub.status === "APPROVED" ? "bg-green-100 text-green-600" : "bg-red-100 text-red-500"
                }`}>
                  {sub.status === "APPROVED" ? "已批核" : "已拒絕"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review Modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 flex items-end z-50" onClick={() => setSelected(null)}>
          <div
            className="bg-white rounded-t-3xl w-full max-h-[80vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold">{selected.student.name} 的提交</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 text-2xl">×</button>
            </div>

            {selected.aiScore !== null && (
              <div className="bg-gray-50 rounded-xl p-3 mb-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-gray-500">AI 評分</span>
                  <span className="font-bold">{selected.aiScore} / 100</span>
                </div>
                {selected.aiFeedback && <p className="text-xs text-gray-600">{selected.aiFeedback}</p>}
              </div>
            )}

            <div className="bg-gray-50 rounded-xl p-3 mb-4 max-h-40 overflow-y-auto">
              <p className="text-xs text-gray-500 mb-1">提交內容</p>
              <pre className="text-xs text-gray-700 whitespace-pre-wrap">
                {JSON.stringify(selected.content, null, 2)}
              </pre>
            </div>

            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="給學生的反饋（可選）"
              rows={3}
              className="w-full border rounded-xl px-3 py-2 text-sm mb-4 resize-none"
            />

            <div className="flex gap-2">
              <button
                onClick={() => review("REJECT")}
                disabled={processing}
                className="flex-1 border border-red-400 text-red-500 py-3 rounded-xl font-medium disabled:opacity-50"
              >
                拒絕
              </button>
              <button
                onClick={() => review("APPROVE")}
                disabled={processing}
                className="flex-1 bg-green-600 text-white py-3 rounded-xl font-medium disabled:opacity-50"
              >
                批核
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
