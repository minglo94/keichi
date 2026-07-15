"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { AgentMarkdown } from "@/components/teacher/AgentMarkdown"

type DocStatus = "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED"

type AgentDoc = {
  id:              string
  title:           string
  docType:         string
  content:         string
  approvalStatus:  DocStatus
  rejectionReason: string | null
  createdAt:       string
  user:            { name: string | null; email: string | null }
  task:            { agentId: string; status: string } | null
}

const APPROVAL_BADGE: Record<DocStatus, { label: string; color: string }> = {
  NOT_REQUIRED: { label: "毋需批核", color: "var(--color-ink-400)"      },
  PENDING:      { label: "待批核",   color: "var(--color-admin)"         },
  APPROVED:     { label: "已批核",   color: "var(--color-curriculum)"    },
  REJECTED:     { label: "已退回",   color: "var(--color-discipline)"    },
}

export default function AgentDocumentPage({ params }: { params: { id: string } }) {
  const [doc,     setDoc]     = useState<AgentDoc | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/agents/documents/${params.id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "沒有權限查看此文件" : "找不到文件")
        return r.json()
      })
      .then(setDoc)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [params.id])

  function downloadMd() {
    if (!doc) return
    const blob = new Blob([doc.content], { type: "text/markdown;charset=utf-8" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a")
    const safe = doc.title.replace(/[^a-z0-9一-龥_-]+/gi, "_").slice(0, 60) || "document"
    a.href = url
    a.download = `${safe}.md`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function copyAll() {
    if (!doc) return
    try { await navigator.clipboard.writeText(doc.content) } catch {}
  }

  const ab = doc ? APPROVAL_BADGE[doc.approvalStatus] : null

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/teacher/agents/tasks" className="text-caption" style={{ color: "var(--color-ink-400)" }}>← 文件記錄</Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">文件</h1>
      </div>

      {loading ? (
        <p className="text-body text-center py-12" style={{ color: "var(--color-ink-300)" }}>載入中…</p>
      ) : error ? (
        <div className="card p-8 text-center" style={{ color: "var(--color-ink-400)" }}>
          <p className="text-body">{error}</p>
          <Link href="/teacher/agents/tasks" className="mt-4 inline-block text-caption font-medium" style={{ color: "var(--color-accent)" }}>
            返回文件記錄 →
          </Link>
        </div>
      ) : doc ? (
        <div className="card p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-4 pb-4 border-b" style={{ borderColor: "var(--color-border)" }}>
            <div className="min-w-0">
              <h2 className="text-h2 mb-1">{doc.title}</h2>
              <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>
                {doc.docType} · {doc.user.name ?? doc.user.email} · {new Date(doc.createdAt).toLocaleString("zh-HK")}
              </p>
            </div>
            {ab && (
              <span className="text-caption px-2 py-0.5 rounded-pill shrink-0" style={{ background: `${ab.color}20`, color: ab.color }}>
                {ab.label}
              </span>
            )}
          </div>

          {doc.approvalStatus === "REJECTED" && doc.rejectionReason && (
            <div className="mb-4 p-3 rounded-input" style={{ background: "var(--color-discipline)15", color: "var(--color-discipline)" }}>
              <p className="text-caption">退回原因：{doc.rejectionReason}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 mb-4">
            <button onClick={downloadMd} className="text-caption px-3 py-1.5 rounded-input font-medium"
              style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
              ⬇ 下載 .md
            </button>
            <button onClick={copyAll} className="text-caption px-3 py-1.5 rounded-input border"
              style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-500)" }}>
              複製全文
            </button>
          </div>

          {/* Rendered document */}
          <div className="rounded-input p-4" style={{ background: "var(--color-surface-2)" }}>
            <AgentMarkdown>{doc.content}</AgentMarkdown>
          </div>
        </div>
      ) : null}
    </div>
  )
}
