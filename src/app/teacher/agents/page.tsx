"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import type { LLMMessage } from "@/lib/llm"
import { AgentMarkdown } from "@/components/teacher/AgentMarkdown"
import { DraftActionCard, type Draft } from "@/components/teacher/DraftActionCard"
import { KEIDA_SUGGESTIONS } from "@/lib/keida-suggestions"

// Strip agent metadata markers from text shown to the user. Markers can
// appear mid-stream (e.g. [NEED_TOOL:...] before a tool result and more
// reply text follow) so each occurrence must be removed in place — cutting
// at the first marker would discard everything the agent says afterward.
function visibleText(raw: string): string {
  return raw
    .replace(/\[DRAFT:\w+\](\s*\{[\s\S]*?\})?/g, "")
    .replace(/\[NEED_TOOL:\w+\](\s*\{[\s\S]*?\})?/g, "")
    .replace(/\[DOCREADY\]/g, "")
    .replace(/\[DOCTYPE:[^\]]+\]/g, "")
    .replace(/\[TITLE:[^\]]+\]/g, "")
    .replace(/\[NEEDS_APPROVAL\]/g, "")
    .replace(/\[ROUTE:\w+\]/g, "")
    .trim()
}

type AgentId = "A01" | "A02" | "A03" | "A04" | "A05" | "A06"

const AGENT_INFO: Record<AgentId, { name: string; color: string }> = {
  A01: { name: "統籌助手",     color: "var(--color-ink-500)"      },
  A02: { name: "課程顧問 Ada", color: "var(--color-curriculum)"   },
  A03: { name: "試卷設計 Ethan", color: "var(--color-discipline)" },
  A04: { name: "內容製作 Carla", color: "var(--color-it)"         },
  A05: { name: "校務行政 Andy", color: "var(--color-admin)"       },
  A06: { name: "數據分析 Donna", color: "var(--color-eca)"        },
}

type StreamEvent = {
  agentId?:   AgentId
  text?:      string
  chunk?:     boolean
  status?:    "running" | "done"
  final?:     boolean
  tool?:      string
  docReady?:  boolean
  documentId?: string
  docType?:   string
  needsApproval?: boolean
  draft?:     Draft | null
  error?:     string
  route?:     string
}

type DisplayMessage = {
  role:     "user" | "agent"
  agentId?: AgentId
  text:     string
  docReady?: boolean
  documentId?: string
  docType?: string
  needsApproval?: boolean
  draft?:   Draft | null
}

export default function AgentsPage() {
  const [messages,      setMessages]      = useState<LLMMessage[]>([])
  const [display,       setDisplay]       = useState<DisplayMessage[]>([])
  const [input,         setInput]         = useState("")
  const [loading,       setLoading]       = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<AgentId | null>(null)
  const [activeTool,    setActiveTool]    = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [display])

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    const newMsg: LLMMessage = { role: "user", content: text }
    const nextMessages = [...messages, newMsg]

    setMessages(nextMessages)
    setDisplay((prev) => [...prev, { role: "user", text }])
    setInput("")
    setLoading(true)
    setActiveAgentId(null)
    setActiveTool(null)

    // Placeholder entry for the streaming agent reply
    setDisplay((prev) => [...prev, { role: "agent", text: "" }])

    try {
      const res = await fetch("/api/agents/chat", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ messages: nextMessages }),
      })

      if (!res.ok || !res.body) {
        setDisplay((prev) => {
          const next = [...prev]
          next[next.length - 1] = { role: "agent", text: `⚠ 錯誤 ${res.status}` }
          return next
        })
        return
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ""
      let accumulated = ""
      let lastAgentId: AgentId | null = null
      let finalEvent: StreamEvent | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split("\n")
        buf = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const ev: StreamEvent = JSON.parse(line.slice(6))

            if (ev.error) {
              setDisplay((prev) => {
                const next = [...prev]
                next[next.length - 1] = { role: "agent", text: `⚠ ${ev.error}` }
                return next
              })
              continue
            }

            if (ev.agentId) setActiveAgentId(ev.agentId)
            if (ev.tool)    setActiveTool(ev.tool)
            else if (ev.status === "running" && !ev.tool) setActiveTool(null)

            if (ev.chunk && ev.text && ev.agentId) {
              lastAgentId = ev.agentId
              accumulated += ev.text
              setDisplay((prev) => {
                const next = [...prev]
                next[next.length - 1] = { role: "agent", agentId: ev.agentId, text: visibleText(accumulated) }
                return next
              })
            }

            if (ev.final) finalEvent = ev
          } catch {}
        }
      }

      if (finalEvent) {
        const cleanText = visibleText(accumulated)
        setMessages((prev) => [...prev, { role: "assistant", content: cleanText }])
        setDisplay((prev) => {
          const next = [...prev]
          next[next.length - 1] = {
            role:          "agent",
            agentId:       lastAgentId ?? undefined,
            text:          cleanText,
            docReady:      finalEvent!.docReady,
            documentId:    finalEvent!.documentId,
            docType:       finalEvent!.docType,
            needsApproval: finalEvent!.needsApproval,
            draft:         finalEvent!.draft ?? null,
          }
          return next
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setDisplay((prev) => {
        const next = [...prev]
        next[next.length - 1] = { role: "agent", text: `⚠ ${msg}` }
        return next
      })
    } finally {
      setLoading(false)
      setActiveAgentId(null)
      setActiveTool(null)
      inputRef.current?.focus()
    }
  }

  function clearChat() {
    setMessages([])
    setDisplay([])
    setInput("")
  }

  const agentInfo = activeAgentId ? AGENT_INFO[activeAgentId] : null

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-3xl mx-auto p-4 gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-h1">AI 助理團隊</h1>
          <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>
            統籌助手 → Ada · Ethan · Carla · Andy · Donna
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/teacher/agents/tasks" className="text-caption px-3 py-1.5 rounded-input border"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-500)" }}>
            文件記錄
          </Link>
          {display.length > 0 && (
            <button onClick={clearChat} className="text-caption px-3 py-1.5 rounded-input border"
              style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-500)" }}>
              清除對話
            </button>
          )}
        </div>
      </div>

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {display.length === 0 && (
          <div className="card p-6 text-center space-y-3">
            <p className="text-h3" style={{ color: "var(--color-ink-700)" }}>你好！有什麼可以幫到你？</p>
            <div className="flex flex-wrap gap-2 justify-center pt-2">
              {KEIDA_SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => { setInput(s); inputRef.current?.focus() }}
                  className="text-caption px-3 py-1.5 rounded-pill"
                  style={{ background: "var(--color-surface-2)", color: "var(--color-ink-600)" }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {display.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] ${msg.role === "user" ? "" : ""}`}>
              {msg.role === "agent" && msg.agentId && (
                <p className="text-[10px] mb-1 font-medium" style={{ color: AGENT_INFO[msg.agentId]?.color }}>
                  {AGENT_INFO[msg.agentId]?.name}
                </p>
              )}
              <div
                className="px-4 py-3"
                style={{
                  background:   msg.role === "user" ? "var(--color-accent)" : "var(--color-surface-2)",
                  borderRadius: msg.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                }}
              >
                {msg.text
                  ? <AgentMarkdown userBubble={msg.role === "user"}>{msg.text}</AgentMarkdown>
                  : (loading && i === display.length - 1
                      ? <span className="text-body" style={{ color: "var(--color-ink-400)" }}>⋯</span>
                      : null)
                }
              </div>
              {msg.docReady && msg.documentId && (
                <div className="mt-2 flex gap-2">
                  <Link href={`/teacher/agents/tasks`}
                    className="text-caption px-3 py-1.5 rounded-input font-medium"
                    style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
                    {msg.needsApproval ? "📋 待批核文件" : "📄 查看文件"}
                  </Link>
                </div>
              )}
              {msg.draft && <DraftActionCard draft={msg.draft} />}
            </div>
          </div>
        ))}

        {/* Active agent status */}
        {loading && agentInfo && (
          <div className="flex justify-start">
            <div className="text-caption px-3 py-1.5 rounded-pill animate-pulse"
              style={{ background: "var(--color-surface-2)", color: agentInfo.color }}>
              {agentInfo.name} {activeTool ? `正在查詢 ${activeTool}…` : "思考中…"}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="card p-3">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="輸入訊息… (Enter 發送)"
            disabled={loading}
            className="flex-1 px-3 py-2 text-body rounded-input border outline-none focus:ring-2 focus:ring-blue-500/20"
            style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }}
          />
          <button
            onClick={send}
            disabled={!input.trim() || loading}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 transition-all hover:scale-105 active:scale-95"
            style={{ background: "var(--color-accent)", opacity: !input.trim() || loading ? 0.6 : 1 }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
