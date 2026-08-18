"use client"

import { useRef, useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import Link from "next/link"
import { KEIDA_GREETING, isGreeting } from "@/lib/keida-greeting"
import { KEIDA_SUGGESTIONS as SUGGESTIONS } from "@/lib/keida-suggestions"
import type { LLMMessage } from "@/lib/llm"
import { AgentMarkdown } from "@/components/teacher/AgentMarkdown"
import { DraftActionCard, type Draft } from "@/components/teacher/DraftActionCard"

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

// ─── Types ────────────────────────────────────────────────────────────────────

type AgentId = "A01" | "A02" | "A03" | "A04" | "A05" | "A06"

const AGENT_INFO: Record<AgentId, { name: string; color: string }> = {
  A01: { name: "統籌助手",       color: "var(--color-ink-500)"      },
  A02: { name: "課程顧問 Ada",   color: "var(--color-curriculum)"   },
  A03: { name: "試卷設計 Ethan", color: "var(--color-discipline)"   },
  A04: { name: "內容製作 Carla", color: "var(--color-it)"           },
  A05: { name: "校務行政 Andy",  color: "var(--color-admin)"        },
  A06: { name: "數據分析 Donna", color: "var(--color-eca)"          },
}

type StreamEvent = {
  agentId?:       AgentId
  text?:          string
  chunk?:         boolean
  status?:        string
  final?:         boolean
  tool?:          string
  docReady?:      boolean
  documentId?:    string
  docType?:       string
  needsApproval?: boolean
  draft?:         Draft | null
  error?:         string
}

type DisplayMsg = {
  role:           "user" | "agent"
  agentId?:       AgentId
  text:           string
  docReady?:      boolean
  documentId?:    string
  docType?:       string
  needsApproval?: boolean
  draft?:         Draft | null
}

type ConvoSummary = {
  id:        string
  title:     string
  updatedAt: string
  _count:    { messages: number }
}

type View = "chat" | "history"

// ─── Component ────────────────────────────────────────────────────────────────

export function AskKeida() {
  const [isOpen,        setIsOpen]        = useState(false)
  const [view,          setView]          = useState<View>("chat")

  // Chat state
  const [messages,      setMessages]      = useState<LLMMessage[]>([])
  const [display,       setDisplay]       = useState<DisplayMsg[]>([])
  const [input,         setInput]         = useState("")
  const [loading,       setLoading]       = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<AgentId | null>(null)
  const [activeTool,    setActiveTool]    = useState<string | null>(null)

  // Conversation persistence
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [conversations,  setConversations]  = useState<ConvoSummary[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 150)
  }, [isOpen])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [display])

  // ── Load history list ──────────────────────────────────────────────────────

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const res = await fetch("/api/agents/conversations")
      if (res.ok) setConversations(await res.json())
    } catch {}
    setHistoryLoading(false)
  }, [])

  useEffect(() => {
    if (isOpen && view === "history") loadHistory()
  }, [isOpen, view, loadHistory])

  // ── Load a past conversation ───────────────────────────────────────────────

  async function loadConversation(id: string) {
    const res = await fetch(`/api/agents/conversations/${id}`)
    if (!res.ok) return
    const convo: { id: string; messages: Array<{ role: string; content: string; agentId: string | null }> } = await res.json()

    setConversationId(convo.id)
    const llmMsgs: LLMMessage[] = convo.messages.map((m) => ({
      role:    m.role as "user" | "assistant",
      content: m.content,
    }))
    setMessages(llmMsgs)
    setDisplay(
      convo.messages.map((m) => ({
        role:    m.role === "user" ? "user" : "agent",
        agentId: (m.agentId as AgentId | null) ?? undefined,
        text:    m.content,
      }))
    )
    setView("chat")
  }

  // ── Delete a conversation ─────────────────────────────────────────────────

  async function deleteConversation(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    await fetch(`/api/agents/conversations/${id}`, { method: "DELETE" })
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (conversationId === id) startNewChat()
  }

  // ── Start a new chat ──────────────────────────────────────────────────────

  function startNewChat() {
    setMessages([])
    setDisplay([])
    setInput("")
    setConversationId(null)
    setView("chat")
    setTimeout(() => inputRef.current?.focus(), 150)
  }

  // ── Send a message ────────────────────────────────────────────────────────

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim()
    if (!text || loading) return

    // Greeting short-circuit
    if (isGreeting(text) && messages.length === 0) {
      setDisplay([{ role: "agent", text: KEIDA_GREETING }])
      setInput("")
      return
    }

    const newMsg: LLMMessage = { role: "user", content: text }
    const nextMessages = [...messages, newMsg]
    setMessages(nextMessages)
    setDisplay((prev) => [...prev, { role: "user", text }])
    setInput("")
    setLoading(true)
    setActiveAgentId(null)
    setActiveTool(null)

    // Placeholder for streaming response
    setDisplay((prev) => [...prev, { role: "agent", text: "" }])

    try {
      // Create conversation on first user message
      let convId = conversationId
      if (!convId) {
        const cr = await fetch("/api/agents/conversations", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ title: text.slice(0, 80) }),
        })
        if (cr.ok) {
          const created = await cr.json()
          convId = created.id
          setConversationId(convId)
        }
      }

      // Save user message
      if (convId) {
        await fetch(`/api/agents/conversations/${convId}/messages`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ role: "user", content: text }),
        }).catch(() => {})
      }

      // Stream from agent chat
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
            if (ev.tool) setActiveTool(ev.tool)
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
        const finalMsg: DisplayMsg = {
          role:          "agent",
          agentId:       lastAgentId ?? undefined,
          text:          cleanText,
          docReady:      finalEvent.docReady,
          documentId:    finalEvent.documentId,
          docType:       finalEvent.docType,
          needsApproval: finalEvent.needsApproval,
          draft:         finalEvent.draft ?? null,
        }
        setMessages((prev) => [...prev, { role: "assistant", content: cleanText }])
        setDisplay((prev) => {
          const next = [...prev]
          next[next.length - 1] = finalMsg
          return next
        })

        // Save assistant message
        if (convId && cleanText) {
          await fetch(`/api/agents/conversations/${convId}/messages`, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ role: "assistant", content: cleanText, agentId: lastAgentId }),
          }).catch(() => {})
        }
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

  const agentInfo = activeAgentId ? AGENT_INFO[activeAgentId] : null

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* FAB */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center z-50 transition-transform hover:scale-110 active:scale-95 overflow-hidden"
        style={{ background: "var(--color-accent)" }}
        title="問 Keida"
      >
        {isOpen ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/keida-avatar.webp" alt="Keida" className="w-14 h-14 object-cover" />
        )}
      </button>

      {/* Popup */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 w-[calc(100vw-3rem)] sm:w-[460px] z-50"
          >
            <div className="card shadow-2xl flex flex-col" style={{ height: "min(78vh, 640px)" }}>

              {/* ── Header ──────────────────────────────────────────────── */}
              <div
                className="p-3 border-b flex items-center gap-2 shrink-0"
                style={{ background: "var(--color-accent-soft)", borderColor: "var(--color-border)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/keida-avatar.webp" alt="Keida" className="w-8 h-8 rounded-full shrink-0 object-cover" />
                <div className="flex-1 min-w-0">
                  <p className="text-h3 leading-tight" style={{ color: "var(--color-accent)" }}>Keida</p>
                  <p className="text-[10px] leading-tight" style={{ color: "var(--color-ink-400)" }}>
                    AI 助理團隊 · Ada · Ethan · Carla · Andy · Donna
                  </p>
                </div>

                {/* Tab switcher */}
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => setView("chat")}
                    className="text-caption px-2 py-1 rounded-input transition-colors"
                    style={{
                      background: view === "chat" ? "var(--color-accent)" : "transparent",
                      color:      view === "chat" ? "white" : "var(--color-ink-500)",
                    }}
                  >
                    💬
                  </button>
                  <button
                    onClick={() => { setView("history"); loadHistory() }}
                    className="text-caption px-2 py-1 rounded-input transition-colors"
                    style={{
                      background: view === "history" ? "var(--color-accent)" : "transparent",
                      color:      view === "history" ? "white" : "var(--color-ink-500)",
                    }}
                  >
                    🕐
                  </button>
                </div>

                {/* New chat */}
                {view === "chat" && display.length > 0 && (
                  <button
                    onClick={startNewChat}
                    className="text-caption px-2 py-1 rounded-input shrink-0"
                    style={{ background: "var(--color-surface-2)", color: "var(--color-ink-500)" }}
                    title="新對話"
                  >
                    ✚
                  </button>
                )}
              </div>

              {/* ── History panel ────────────────────────────────────────── */}
              {view === "history" && (
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-caption font-medium" style={{ color: "var(--color-ink-600)" }}>對話記錄</p>
                    <button onClick={startNewChat} className="text-caption px-2 py-1 rounded-input"
                      style={{ background: "var(--color-accent)", color: "white" }}>
                      + 新對話
                    </button>
                  </div>

                  {historyLoading ? (
                    <p className="text-caption text-center py-6" style={{ color: "var(--color-ink-300)" }}>載入中…</p>
                  ) : conversations.length === 0 ? (
                    <p className="text-caption text-center py-6" style={{ color: "var(--color-ink-300)" }}>
                      尚未有對話記錄
                    </p>
                  ) : conversations.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => loadConversation(c.id)}
                      className="flex items-center gap-2 p-3 rounded-input cursor-pointer transition-colors group"
                      style={{
                        background: c.id === conversationId ? "var(--color-accent-soft)" : "var(--color-surface-2)",
                        border:     c.id === conversationId ? "1px solid var(--color-accent)" : "1px solid transparent",
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-caption font-medium truncate" style={{ color: "var(--color-ink-900)" }}>
                          {c.title}
                        </p>
                        <p className="text-[10px] mt-0.5" style={{ color: "var(--color-ink-400)" }}>
                          {c._count.messages} 則訊息 · {new Date(c.updatedAt).toLocaleString("zh-HK", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <button
                        onClick={(e) => deleteConversation(c.id, e)}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-caption px-1.5 py-0.5 rounded shrink-0"
                        style={{ color: "var(--color-discipline)" }}
                        title="刪除"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Chat panel ───────────────────────────────────────────── */}
              {view === "chat" && (
                <>
                  <div className="flex-1 overflow-y-auto p-3 space-y-3">

                    {/* Empty state */}
                    {display.length === 0 && (
                      <div className="space-y-3">
                        <div className="rounded-input p-4" style={{ background: "var(--color-surface-2)" }}>
                          <AgentMarkdown>{KEIDA_GREETING}</AgentMarkdown>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {SUGGESTIONS.map((s) => (
                            <button
                              key={s}
                              onClick={() => { setInput(s); inputRef.current?.focus() }}
                              className="text-caption px-3 py-1.5 rounded-pill"
                              style={{ background: "var(--color-surface-2)", color: "var(--color-ink-600)" }}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Messages */}
                    {display.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                        <div className="max-w-[88%]">
                          {msg.role === "agent" && msg.agentId && (
                            <p className="text-[10px] mb-1 font-medium" style={{ color: AGENT_INFO[msg.agentId]?.color }}>
                              {AGENT_INFO[msg.agentId]?.name}
                            </p>
                          )}
                          <div
                            className="px-3 py-2"
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

                          {/* Doc-ready action */}
                          {msg.docReady && msg.documentId && (
                            <div className="mt-1.5">
                              <Link
                                href="/teacher/agents/tasks"
                                className="text-caption px-3 py-1.5 rounded-input font-medium inline-block"
                                style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
                              >
                                {msg.needsApproval ? "📋 待批核文件" : "📄 查看文件"}
                              </Link>
                            </div>
                          )}

                          {/* Quick-create confirmation card */}
                          {msg.draft && <DraftActionCard draft={msg.draft} />}
                        </div>
                      </div>
                    ))}

                    {/* Agent thinking status */}
                    {loading && agentInfo && (
                      <div className="flex justify-start">
                        <div
                          className="text-caption px-3 py-1.5 rounded-pill animate-pulse"
                          style={{ background: "var(--color-surface-2)", color: agentInfo.color }}
                        >
                          {agentInfo.name} {activeTool ? `正在查詢 ${activeTool}…` : "思考中…"}
                        </div>
                      </div>
                    )}

                    <div ref={bottomRef} />
                  </div>

                  {/* ── Input ────────────────────────────────────────────── */}
                  <div className="p-3 border-t shrink-0" style={{ borderColor: "var(--color-border)" }}>
                    <div className="flex items-center gap-2">
                      <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
                        placeholder="問 Keida… (Enter 發送)"
                        disabled={loading}
                        className="flex-1 px-3 py-2 text-body rounded-input border outline-none focus:ring-2 focus:ring-blue-500/20"
                        style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }}
                      />
                      <button
                        onClick={() => send()}
                        disabled={!input.trim() || loading}
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 transition-all hover:scale-105 active:scale-95"
                        style={{ background: "var(--color-accent)", opacity: !input.trim() || loading ? 0.6 : 1 }}
                      >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-1.5 px-1">
                      <p className="text-[10px]" style={{ color: "var(--color-ink-300)" }}>
                        Keida 統籌，按需路由至各專責助手
                      </p>
                      <Link href="/teacher/agents/tasks" className="text-[10px]" style={{ color: "var(--color-ink-400)" }}>
                        文件記錄 →
                      </Link>
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
