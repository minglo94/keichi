"use client"

import { useEffect, useState } from "react"
import Link from "next/link"

type DocStatus = "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED"

type Task = {
  id:        string
  title:     string
  agentId:   string
  status:    string
  createdAt: string
  document:  { id: string; docType: string; approvalStatus: DocStatus } | null
}

const STATUS_BADGE: Record<string, { label: string; color: string }> = {
  RUNNING:          { label: "進行中",   color: "var(--color-it)"         },
  DONE:             { label: "完成",     color: "var(--color-curriculum)"  },
  FAILED:           { label: "失敗",     color: "var(--color-discipline)"  },
  PENDING_APPROVAL: { label: "待批核",   color: "var(--color-admin)"       },
}

const APPROVAL_BADGE: Record<DocStatus, { label: string; color: string }> = {
  NOT_REQUIRED: { label: "毋需批核", color: "var(--color-ink-400)"       },
  PENDING:      { label: "待批核",   color: "var(--color-admin)"          },
  APPROVED:     { label: "已批核",   color: "var(--color-curriculum)"     },
  REJECTED:     { label: "已退回",   color: "var(--color-discipline)"     },
}

export default function AgentTasksPage() {
  const [tasks,   setTasks]   = useState<Task[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/agents/tasks")
      .then((r) => r.ok ? r.json() : [])
      .then(setTasks)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/teacher/agents" className="text-caption" style={{ color: "var(--color-ink-400)" }}>← AI 助理</Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">文件記錄</h1>
      </div>

      {loading ? (
        <p className="text-body text-center py-12" style={{ color: "var(--color-ink-300)" }}>載入中…</p>
      ) : tasks.length === 0 ? (
        <div className="card p-8 text-center" style={{ color: "var(--color-ink-300)" }}>
          <p className="text-body">尚未有 AI 生成的文件</p>
          <Link href="/teacher/agents" className="mt-4 inline-block text-caption font-medium" style={{ color: "var(--color-accent)" }}>
            開始對話 →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map((task) => {
            const sb = STATUS_BADGE[task.status]
            const ab = task.document ? APPROVAL_BADGE[task.document.approvalStatus] : null
            const inner = (
              <div className="card p-4 flex items-center gap-4 h-full">
                <div className="flex-1 min-w-0">
                  <p className="text-body font-medium truncate" style={{ color: "var(--color-ink-900)" }}>{task.title}</p>
                  <p className="text-caption mt-0.5" style={{ color: "var(--color-ink-400)" }}>
                    {task.agentId} · {new Date(task.createdAt).toLocaleString("zh-HK")}
                    {task.document && ` · ${task.document.docType}`}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-caption px-2 py-0.5 rounded-pill" style={{ background: `${sb.color}20`, color: sb.color }}>
                    {sb.label}
                  </span>
                  {ab && (
                    <span className="text-caption px-2 py-0.5 rounded-pill" style={{ background: `${ab.color}20`, color: ab.color }}>
                      {ab.label}
                    </span>
                  )}
                  {task.document && (
                    <span className="text-caption" style={{ color: "var(--color-accent)" }}>查看 →</span>
                  )}
                </div>
              </div>
            )
            return task.document ? (
              <Link key={task.id} href={`/teacher/agents/documents/${task.document.id}`}
                className="block transition-shadow hover:shadow-card-md rounded-card">
                {inner}
              </Link>
            ) : (
              <div key={task.id}>{inner}</div>
            )
          })}
        </div>
      )}
    </div>
  )
}
