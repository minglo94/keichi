"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"

type AuditLog = {
  id:        string
  action:    string
  agentId:   string | null
  engine:    string
  docType:   string | null
  createdAt: string
  user:      { name: string | null; email: string | null }
}

const ACTION_BADGE: Record<string, { label: string; color: string }> = {
  GENERATE: { label: "生成",   color: "var(--color-it)"          },
  APPROVE:  { label: "批核",   color: "var(--color-curriculum)"  },
  REJECT:   { label: "退回",   color: "var(--color-discipline)"  },
}

const AGENT_NAMES: Record<string, string> = {
  A01: "統籌助手", A02: "課程顧問 Ada", A03: "試卷設計 Ethan",
  A04: "內容製作 Carla", A05: "校務行政 Andy", A06: "數據分析 Donna",
}

export default function AuditLogPage() {
  const [logs,    setLogs]    = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [action,  setAction]  = useState<string>("")

  const load = useCallback(() => {
    setLoading(true)
    const qs = action ? `?action=${action}` : ""
    fetch(`/api/agents/audit${qs}`)
      .then((r) => r.ok ? r.json() : [])
      .then(setLogs)
      .finally(() => setLoading(false))
  }, [action])

  useEffect(() => { load() }, [load])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/teacher" className="text-caption" style={{ color: "var(--color-ink-400)" }}>← 老師主頁</Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">AI 操作紀錄</h1>
      </div>
      <p className="text-caption mb-6" style={{ color: "var(--color-ink-400)" }}>
        AI 助理生成、批核及退回文件的完整紀錄（唯讀）。
      </p>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {[
          { key: "",         label: "全部" },
          { key: "GENERATE", label: "生成" },
          { key: "APPROVE",  label: "批核" },
          { key: "REJECT",   label: "退回" },
        ].map((f) => (
          <button key={f.key} onClick={() => setAction(f.key)}
            className="text-caption px-3 py-1.5 rounded-input transition-colors"
            style={{
              background: action === f.key ? "var(--color-accent)" : "var(--color-surface-2)",
              color:      action === f.key ? "white" : "var(--color-ink-600)",
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-body text-center py-12" style={{ color: "var(--color-ink-300)" }}>載入中…</p>
      ) : logs.length === 0 ? (
        <div className="card p-8 text-center" style={{ color: "var(--color-ink-300)" }}>
          <p className="text-body">沒有紀錄</p>
        </div>
      ) : (
        <div className="card divide-y" style={{ borderColor: "var(--color-border)" }}>
          {logs.map((log) => {
            const ab = ACTION_BADGE[log.action] ?? { label: log.action, color: "var(--color-ink-400)" }
            return (
              <div key={log.id} className="flex items-center gap-3 p-3" style={{ borderColor: "var(--color-border)" }}>
                <span className="text-caption px-2 py-0.5 rounded-pill shrink-0" style={{ background: `${ab.color}20`, color: ab.color }}>
                  {ab.label}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-body truncate" style={{ color: "var(--color-ink-900)" }}>
                    {log.user.name ?? log.user.email ?? "—"}
                    {log.docType && <span style={{ color: "var(--color-ink-400)" }}> · {log.docType}</span>}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: "var(--color-ink-400)" }}>
                    {log.agentId ? (AGENT_NAMES[log.agentId] ?? log.agentId) + " · " : ""}
                    {log.engine} · {new Date(log.createdAt).toLocaleString("zh-HK")}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
