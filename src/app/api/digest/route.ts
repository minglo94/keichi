/**
 * GET /api/digest
 *
 * Returns yesterday's announcements, agent approvals/rejections, and
 * agent-generated documents as a single markdown note, formatted to be
 * saved directly into the Obsidian vault (School\Medvault Logs\).
 *
 * This replaces relying on src/lib/obsidian-log.ts in production —
 * that helper shells out to a script with a hardcoded local OneDrive path
 * and silently no-ops on any other machine, including Zeabur. Instead: a
 * LOCAL scheduled agent (not code in this repo) pulls this endpoint each
 * morning and writes the result into the vault itself. logToObsidian stays
 * dev-only.
 *
 * Auth: shared-secret header (same pattern as /api/cron/build-student-profiles)
 * since the caller is a scheduled script, not an interactive session.
 */
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

function startOfYesterday(): Date {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 })
  }
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const gte = startOfYesterday()
  const lt = startOfToday()
  const dateStr = gte.toISOString().split("T")[0]

  const [announcements, auditLogs, agentDocuments] = await Promise.all([
    prisma.announcement.findMany({
      where: { createdAt: { gte, lt } },
      orderBy: { createdAt: "asc" },
      select: { title: true, body: true, priority: true, committee: true, author: { select: { name: true } } },
    }),
    prisma.agentAuditLog.findMany({
      where: { createdAt: { gte, lt }, action: { in: ["APPROVE", "REJECT"] } },
      orderBy: { createdAt: "asc" },
      select: { action: true, agentId: true, docType: true, user: { select: { name: true } } },
    }),
    prisma.agentDocument.findMany({
      where: { createdAt: { gte, lt } },
      orderBy: { createdAt: "asc" },
      select: { title: true, docType: true, approvalStatus: true, user: { select: { name: true } } },
    }),
  ])

  const lines: string[] = [
    "---",
    `date: ${dateStr}`,
    "tags: [keichi, digest, ai-log]",
    "---",
    "",
    `# Keichi 每日摘要 ${dateStr}`,
    "",
  ]

  lines.push(`## 公告 (${announcements.length})`)
  if (announcements.length === 0) {
    lines.push("（無）")
  } else {
    for (const a of announcements) {
      const badge = a.priority !== "NORMAL" ? `【${a.priority}】` : ""
      lines.push(`- ${badge}**${a.title}**（${a.author.name ?? "未知"}）${a.committee ? ` [${a.committee}]` : ""}`)
      lines.push(`  ${a.body.slice(0, 150)}${a.body.length > 150 ? "…" : ""}`)
    }
  }
  lines.push("")

  lines.push(`## Agent 文件審批 (${auditLogs.length})`)
  if (auditLogs.length === 0) {
    lines.push("（無）")
  } else {
    for (const log of auditLogs) {
      lines.push(`- ${log.action}：${log.docType ?? "文件"}（${log.agentId ?? "?"}，由 ${log.user.name ?? "未知"} 處理）`)
    }
  }
  lines.push("")

  lines.push(`## Agent 生成文件 (${agentDocuments.length})`)
  if (agentDocuments.length === 0) {
    lines.push("（無）")
  } else {
    for (const doc of agentDocuments) {
      lines.push(`- **${doc.title}**（${doc.docType}，${doc.approvalStatus}，${doc.user.name ?? "未知"}）`)
    }
  }

  return NextResponse.json({
    date: dateStr,
    markdown: lines.join("\n"),
    counts: {
      announcements: announcements.length,
      approvals: auditLogs.length,
      agentDocuments: agentDocuments.length,
    },
  })
}
