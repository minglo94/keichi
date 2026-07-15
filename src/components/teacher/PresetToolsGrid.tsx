"use client"

import { useState } from "react"
import Link from "next/link"
import { FavoriteToolButton } from "@/components/teacher/FavoriteToolButton"
import { isRegisteredTool } from "@/lib/tool-registry"

export type PresetTool = {
  label:       string
  description: string
  href?:       string
}

type Props = {
  tools:        PresetTool[]
  committee:    string
  canEdit:      boolean
  colorVar:     string
  favoriteKeys: string[]
  hiddenKeys:   string[]
}

export function PresetToolsGrid({ tools, committee, canEdit, colorVar, favoriteKeys, hiddenKeys }: Props) {
  const [hidden, setHidden]         = useState<Set<string>>(new Set(hiddenKeys))
  const [showHidden, setShowHidden] = useState(false)
  const favSet = new Set(favoriteKeys)

  async function hide(toolKey: string) {
    setHidden((prev) => new Set(prev).add(toolKey)) // optimistic
    try {
      const res = await fetch("/api/committee-tools/hidden", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ committee, toolKey }),
      })
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      setHidden((prev) => { const next = new Set(prev); next.delete(toolKey); return next }) // revert
    }
  }

  async function restore(toolKey: string) {
    setHidden((prev) => { const next = new Set(prev); next.delete(toolKey); return next }) // optimistic
    try {
      const res = await fetch("/api/committee-tools/hidden", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ committee, toolKey }),
      })
      if (!res.ok) throw new Error(String(res.status))
    } catch {
      setHidden((prev) => new Set(prev).add(toolKey)) // revert
    }
  }

  const visible      = tools.filter((t) => !hidden.has(t.label))
  const hiddenTools  = tools.filter((t) => hidden.has(t.label))

  function Card({ tool }: { tool: PresetTool }) {
    const starrable = !!tool.href && isRegisteredTool(tool.href)
    const inner = (
      <>
        <h3 className="text-h3 mb-1 pr-6">{tool.label}</h3>
        <p className="text-caption" style={{ color: "var(--color-ink-500)" }}>
          {tool.description}
        </p>
        <p
          className="text-caption mt-3 font-medium"
          style={{ color: tool.href ? `var(--color-${colorVar})` : "var(--color-ink-300)" }}
        >
          {tool.href ? "開啟 →" : "即將推出"}
        </p>
      </>
    )
    return (
      <div className="relative">
        {tool.href ? (
          <Link href={tool.href} className="card p-5 hover:shadow-card-md transition-shadow block h-full">
            {inner}
          </Link>
        ) : (
          <div className="card p-5 opacity-60 cursor-not-allowed h-full">{inner}</div>
        )}

        {/* Star + delete controls */}
        <div className="absolute top-3 right-3 flex items-center gap-1">
          {starrable && (
            <FavoriteToolButton
              toolKey={tool.href!}
              initialFavorited={favSet.has(tool.href!)}
              colorVar={colorVar}
            />
          )}
          {canEdit && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); hide(tool.label) }}
              aria-label="刪除預設工具"
              title="刪除（可還原）"
              className="shrink-0 transition-transform hover:scale-110 active:scale-90"
              style={{ color: "var(--color-ink-300)" }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-h3" style={{ color: "var(--color-ink-700)" }}>預設工具</h3>
        {canEdit && hiddenTools.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className="text-caption transition-opacity hover:opacity-70"
            style={{ color: "var(--color-ink-400)" }}
          >
            {showHidden ? "隱藏" : `已隱藏 (${hiddenTools.length})`}
          </button>
        )}
      </div>

      {visible.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visible.map((tool) => <Card key={tool.label} tool={tool} />)}
        </div>
      )}

      {/* Hidden presets — restore section (editors only) */}
      {canEdit && showHidden && hiddenTools.length > 0 && (
        <div className="mt-4 pt-4 border-t" style={{ borderColor: "var(--color-border)" }}>
          <p className="text-caption mb-2" style={{ color: "var(--color-ink-400)" }}>已隱藏的預設工具</p>
          <div className="flex flex-wrap gap-2">
            {hiddenTools.map((tool) => (
              <div
                key={tool.label}
                className="flex items-center gap-2 px-3 py-1.5 rounded-input"
                style={{ background: "var(--color-surface-2)" }}
              >
                <span className="text-caption" style={{ color: "var(--color-ink-500)" }}>{tool.label}</span>
                <button
                  type="button"
                  onClick={() => restore(tool.label)}
                  className="text-caption font-medium transition-opacity hover:opacity-70"
                  style={{ color: `var(--color-${colorVar})` }}
                >
                  還原
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
