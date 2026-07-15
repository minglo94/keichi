"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { useState, useCallback } from "react"

// ── Table wrapper with copy-to-Excel button ───────────────────────────────────
function AgentTable({ children, node: _node, ...props }: React.ComponentPropsWithoutRef<"table"> & { node?: unknown }) {
  const [copied, setCopied] = useState(false)

  const copyTsv = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    // Walk the DOM table and produce TSV
    const btn   = e.currentTarget
    const table = btn.closest(".agent-table-wrap")?.querySelector("table")
    if (!table) return

    const rows: string[] = []
    table.querySelectorAll("tr").forEach((tr) => {
      const cells = Array.from(tr.querySelectorAll("th,td")).map((c) =>
        (c as HTMLElement).innerText.replace(/\t/g, " ").trim()
      )
      rows.push(cells.join("\t"))
    })

    navigator.clipboard.writeText(rows.join("\n")).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [])

  return (
    <div className="agent-table-wrap my-3">
      <div className="overflow-x-auto rounded-input border" style={{ borderColor: "var(--color-border)" }}>
        <table className="w-full text-body border-collapse" {...props}>
          {children}
        </table>
      </div>
      <button
        type="button"
        onClick={copyTsv}
        className="mt-1.5 text-caption px-2.5 py-1 rounded-input border transition-colors"
        style={{
          border:     "1px solid var(--color-border)",
          color:      copied ? "var(--color-curriculum)" : "var(--color-ink-400)",
          background: "var(--color-surface-2)",
        }}
      >
        {copied ? "✓ 已複製" : "📋 複製表格（Excel 貼上）"}
      </button>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export function AgentMarkdown({
  children,
  userBubble = false,
}: {
  children: string
  userBubble?: boolean
}) {
  const prose = userBubble ? "white" : "var(--color-ink-900)"
  const muted = userBubble ? "rgba(255,255,255,0.75)" : "var(--color-ink-400)"

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // ── Headings ─────────────────────────────────────────────────────────
        h1: ({ children }) => (
          <h1 className="text-h1 font-bold mt-4 mb-2 first:mt-0" style={{ color: prose }}>{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-h2 font-semibold mt-3 mb-1.5 first:mt-0" style={{ color: prose }}>{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-h3 font-semibold mt-2 mb-1 first:mt-0" style={{ color: prose }}>{children}</h3>
        ),

        // ── Paragraph ────────────────────────────────────────────────────────
        p: ({ children }) => (
          <p className="text-body leading-relaxed mb-2 last:mb-0" style={{ color: prose }}>{children}</p>
        ),

        // ── Lists ─────────────────────────────────────────────────────────────
        ul: ({ children }) => (
          <ul className="list-disc list-inside space-y-0.5 mb-2 text-body" style={{ color: prose }}>{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside space-y-0.5 mb-2 text-body" style={{ color: prose }}>{children}</ol>
        ),
        li: ({ children }) => (
          <li className="leading-relaxed">{children}</li>
        ),

        // ── Code — react-markdown v9: detect block vs inline via className ────
        code: ({ className, children, ...rest }) => {
          const isBlock = Boolean(className?.startsWith("language-"))
          return isBlock ? (
            <pre
              className="text-caption font-mono p-3 rounded-input overflow-x-auto my-2"
              style={{ background: userBubble ? "rgba(0,0,0,0.2)" : "var(--color-surface-2)", color: prose }}
            >
              <code className={className} {...rest}>{children}</code>
            </pre>
          ) : (
            <code
              className="text-caption font-mono px-1.5 py-0.5 rounded"
              style={{ background: userBubble ? "rgba(255,255,255,0.2)" : "var(--color-surface-2)", color: prose }}
              {...rest}
            >
              {children}
            </code>
          )
        },

        // ── Strong / em ───────────────────────────────────────────────────────
        strong: ({ children }) => (
          <strong className="font-semibold" style={{ color: prose }}>{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic" style={{ color: muted }}>{children}</em>
        ),

        // ── Horizontal rule ───────────────────────────────────────────────────
        hr: () => (
          <hr className="my-3" style={{ borderColor: "var(--color-border)" }} />
        ),

        // ── TABLE — styled + copy button ──────────────────────────────────────
        table: AgentTable,

        thead: ({ children }) => (
          <thead style={{ background: "var(--color-surface-2)" }}>{children}</thead>
        ),

        tbody: ({ children }) => (
          <tbody>{children}</tbody>
        ),

        tr: ({ children }) => (
          <tr className="border-b transition-colors hover:bg-black/[0.02]"
            style={{ borderColor: "var(--color-border)" }}>
            {children}
          </tr>
        ),

        th: ({ children }) => (
          <th
            className="text-caption font-semibold px-3 py-2 text-left whitespace-nowrap"
            style={{ color: "var(--color-ink-700)", borderRight: "1px solid var(--color-border)" }}
          >
            {children}
          </th>
        ),

        td: ({ children }) => (
          <td
            className="text-caption px-3 py-2 align-top"
            style={{ color: "var(--color-ink-800)", borderRight: "1px solid var(--color-border)" }}
          >
            {children}
          </td>
        ),

        // ── Blockquote ────────────────────────────────────────────────────────
        blockquote: ({ children }) => (
          <blockquote
            className="border-l-4 pl-3 my-2 text-body italic"
            style={{ borderColor: "var(--color-accent)", color: muted }}
          >
            {children}
          </blockquote>
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
