import { NextRequest } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin } from "@/lib/roles"
import { streamLLM, completeLLM, type LLMMessage } from "@/lib/llm"
import {
  loadCharter, parseRoute, parseDocReady, parseDocType,
  parseNeedsApproval, parseDocTitle, agentId, inferTitleFromContent,
  parseNeedTool, stripToolMarkers, parseDraft, stripDraftMarkers,
  AGENT_DOC_TYPES, type AgentKey,
} from "@/lib/agents"
import { runAgentTool } from "@/lib/agent-tools"
import { prisma } from "@/lib/prisma"
import { pusherServer } from "@/lib/pusher"
import { aiRateLimit } from "@/lib/rate-limit"

async function pushEvent(userId: string, event: string, data: object) {
  try {
    await pusherServer.trigger(`private-user-${userId}`, event, data)
  } catch {}
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id || !isTeacherOrAdmin(session.user.role)) {
    return new Response(JSON.stringify({ error: "未登入或無權限" }), { status: 401 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return new Response(JSON.stringify({ error: "伺服器未設定 ANTHROPIC_API_KEY，請聯絡 IT 主任。" }), { status: 503 })
  }

  const limited = await aiRateLimit(session.user.id, session.user.role, "agents")
  if (limited) return new Response(JSON.stringify(limited.body), { status: 429, headers: { ...limited.headers, "Content-Type": "application/json" } })

  const { messages } = (await req.json()) as { messages: LLMMessage[] }

  const userId  = session.user.id
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch {}
      }

      try {
        // ── Stage 1: Dispatcher ──────────────────────────────────────────
        await pushEvent(userId, "agent-status", { agentId: "A01", status: "running" })
        send({ agentId: "A01", status: "running" })

        const dispatcherReply = await completeLLM("claude", messages, {
          system: loadCharter("dispatcher"), maxTokens: 512,
        })

        await pushEvent(userId, "agent-status", { agentId: "A01", status: "done" })

        const routeKey = parseRoute(dispatcherReply)

        if (!routeKey) {
          const clean = dispatcherReply.replace(/\[ROUTE:\w+\]/g, "").replace(/\[NEED_TOOL:\w+\]/g, "").trim()
          send({ agentId: "A01", text: clean, chunk: true })
          send({ agentId: "A01", status: "done", final: true })
          controller.close()
          return
        }

        // ── Stage 2: Specialist ──────────────────────────────────────────
        const specId = agentId(routeKey)
        await pushEvent(userId, "agent-status", { agentId: specId, status: "running" })
        send({ agentId: specId, status: "running", route: routeKey })

        let specialistSystem = loadCharter(routeKey)

        // Inject default templates for this agent's docTypes
        try {
          const relevantTypes = AGENT_DOC_TYPES[routeKey as AgentKey] ?? []
          if (relevantTypes.length > 0) {
            const defaults = await prisma.agentTemplate.findMany({
              where: { docType: { in: relevantTypes }, isDefault: true },
            })
            if (defaults.length > 0) {
              const sections = defaults.map((t) => `【${t.name}】（類型：${t.docType}）\n${t.content}`).join("\n\n---\n\n")
              specialistSystem += `\n\n---\n[範本庫]\n以下是管理員設定的預設範本，請參考其格式和結構生成文件。使用 {{}} 佔位符標示的位置請根據對話內容填充實際資訊。\n\n${sections}`
            }
          }
        } catch {}

        let fullText = ""
        let workingMessages = [...messages]

        for await (const chunk of streamLLM("claude", workingMessages, { system: specialistSystem, maxTokens: 4096 })) {
          fullText += chunk
          send({ agentId: specId, text: chunk, chunk: true })
        }

        // ── Tool call loop ───────────────────────────────────────────────
        let toolCall  = parseNeedTool(fullText)
        let toolRound = 0
        while (toolCall && toolRound < 2) {
          toolRound++
          send({ agentId: specId, status: "running", tool: toolCall.tool })
          await pushEvent(userId, "agent-status", { agentId: specId, status: "running", tool: toolCall.tool })

          const toolResult = await runAgentTool(toolCall)

          workingMessages = [
            ...workingMessages,
            { role: "assistant" as const, content: fullText },
            { role: "user" as const, content: `[系統：工具 ${toolCall.tool} 執行結果]\n${toolResult}\n\n請根據以上結果回覆用戶。` },
          ]

          fullText = ""
          send({ agentId: specId, text: "\n\n", chunk: true })
          for await (const chunk of streamLLM("claude", workingMessages, { system: specialistSystem, maxTokens: 4096 })) {
            fullText += chunk
            send({ agentId: specId, text: chunk, chunk: true })
          }
          toolCall = parseNeedTool(fullText)
        }

        await pushEvent(userId, "agent-status", { agentId: specId, status: "done" })

        const docReady      = parseDocReady(fullText)
        const docType       = parseDocType(fullText)
        const needsApproval = parseNeedsApproval(fullText)
        const docTitleTag   = parseDocTitle(fullText)
        const draft         = parseDraft(fullText)   // proposed quick-create record (no DB write here)

        const cleanContent = stripDraftMarkers(stripToolMarkers(
          fullText
            .replace(/\[DOCREADY\]/g, "")
            .replace(/\[DOCTYPE:[^\]]+\]/g, "")
            .replace(/\[TITLE:[^\]]+\]/g, "")
            .replace(/\[NEEDS_APPROVAL\]/g, ""),
        )).trim()

        const docTitle = docTitleTag ?? inferTitleFromContent(docType, cleanContent)

        let documentId: string | null = null

        if (docReady) {
          try {
            const task = await prisma.agentTask.create({
              data: { userId, title: docTitle, agentId: specId, status: needsApproval ? "PENDING_APPROVAL" : "DONE" },
            })
            const doc = await prisma.agentDocument.create({
              data: {
                taskId:         task.id,
                userId,
                title:          docTitle,
                docType,
                content:        cleanContent,
                approvalStatus: needsApproval ? "PENDING" : "NOT_REQUIRED",
              },
            })
            documentId = doc.id

            await prisma.agentAuditLog.create({
              data: { userId, action: "GENERATE", agentId: specId, engine: "claude", docType },
            })

            await pushEvent(userId, "task-update", { taskId: task.id, status: task.status, agentId: specId, title: task.title })
          } catch (dbErr) {
            console.error("[agents/chat] DB error:", dbErr)
          }
        }

        send({ agentId: specId, status: "done", docReady, documentId, docType, needsApproval, draft, final: true })
        controller.close()
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[agents/chat]", err)
        send({ error: `處理失敗：${msg.slice(0, 120)}` })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      Connection:      "keep-alive",
    },
  })
}
