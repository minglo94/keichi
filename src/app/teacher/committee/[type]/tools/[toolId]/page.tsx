"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"

type ToolType = "LINK" | "EMBED" | "HTML" | "GOOGLE_SHEET"

type Tool = {
  id:          string
  committee:   string
  label:       string
  description: string | null
  type:        ToolType
  content:     string
}

function EmbedFrame({ src }: { src: string }) {
  const [blocked, setBlocked] = useState(false)

  // Proactively detect known non-embeddable patterns
  const likelyBlocked =
    src.includes("script.google.com") ||
    src.includes("accounts.google.com") ||
    src.includes("google.com/forms")

  if (blocked || likelyBlocked) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
        <p className="text-body" style={{ color: "var(--color-ink-500)" }}>
          此網站不允許嵌入顯示（通常為登入保護或安全限制）
        </p>
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 text-body font-medium rounded-input text-white"
          style={{ background: "var(--color-accent)" }}
        >
          在新分頁開啟 ↗
        </a>
      </div>
    )
  }

  return (
    <iframe
      src={src}
      className="w-full h-full border-none"
      allow="fullscreen"
      onError={() => setBlocked(true)}
    />
  )
}

function toEmbedUrl(content: string): string {
  // Convert Google Sheets /edit... URL to /pubhtml for embedding
  return content.replace(/\/edit[^?]*(\?.*)?$/, "/pubhtml")
}

export default function ToolViewerPage() {
  const { type, toolId } = useParams<{ type: string; toolId: string }>()
  const router = useRouter()
  const [tool, setTool] = useState<Tool | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    fetch(`/api/committee-tools/${toolId}`)
      .then((r) => {
        if (!r.ok) { setError("找不到工具"); return null }
        return r.json()
      })
      .then((data: Tool | null) => {
        if (!data) return
        if (data.type === "LINK") {
          // Redirect to internal route
          router.replace(data.content)
        } else {
          setTool(data)
        }
      })
  }, [toolId, router])

  if (error) {
    return (
      <div className="p-6 text-center">
        <p className="text-body" style={{ color: "var(--color-ink-500)" }}>{error}</p>
        <Link href={`/teacher/committee/${type}`} className="text-caption mt-2 inline-block"
          style={{ color: "var(--color-accent)" }}>← 返回</Link>
      </div>
    )
  }

  if (!tool) {
    return (
      <div className="p-6 text-center text-body" style={{ color: "var(--color-ink-300)" }}>載入中…</div>
    )
  }

  const backHref = `/teacher/committee/${type}`

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 0px)" }}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2 shrink-0"
        style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
        <Link href={backHref} className="text-caption" style={{ color: "var(--color-ink-400)" }}>
          ← {type.toUpperCase()}
        </Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <span className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>{tool.label}</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden relative">
        {tool.type === "EMBED" && (
          <EmbedFrame src={tool.content} />
        )}
        {tool.type === "GOOGLE_SHEET" && (
          <iframe
            src={toEmbedUrl(tool.content)}
            className="w-full h-full border-none"
          />
        )}
        {tool.type === "HTML" && (
          // SECURITY: sandbox WITHOUT allow-same-origin — scripts run in a
          // null origin with no access to app cookies/localStorage and cannot
          // call authenticated same-origin APIs. Never add allow-same-origin
          // here; combined with allow-scripts it voids the sandbox entirely.
          <iframe
            srcDoc={tool.content}
            sandbox="allow-scripts"
            className="w-full h-full border-none"
          />
        )}
      </div>
    </div>
  )
}
