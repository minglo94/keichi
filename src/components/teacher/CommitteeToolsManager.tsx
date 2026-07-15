"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { FavoriteToolButton } from "@/components/teacher/FavoriteToolButton"

type ToolType = "LINK" | "EMBED" | "HTML" | "GOOGLE_SHEET"

type DBTool = {
  id:          string
  label:       string
  description: string | null
  type:        ToolType
  content:     string
  order:       number
  active:      boolean
}

const TYPE_LABELS: Record<ToolType, string> = {
  LINK:         "內部連結",
  EMBED:        "嵌入網頁",
  HTML:         "HTML 內容",
  GOOGLE_SHEET: "Google 試算表",
}

type Props = {
  initialTools: DBTool[]
  committee:    string
  slug:         string
  canEdit:      boolean
  colorVar:     string
}

export function CommitteeToolsManager({ initialTools, committee, slug, canEdit, colorVar }: Props) {
  const [tools,        setTools]        = useState<DBTool[]>(initialTools)
  const [showModal,    setShowModal]    = useState(false)
  const [editTool,     setEditTool]     = useState<DBTool | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [deleting,     setDeleting]     = useState<string | null>(null)
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch("/api/tool-favorites")
      .then((r) => r.ok ? r.json() : { keys: [] })
      .then((d: { keys: string[] }) => setFavoriteKeys(new Set(d.keys)))
      .catch(() => {})
  }, [])

  // Form state
  const [label,   setLabel]   = useState("")
  const [desc,    setDesc]    = useState("")
  const [type,    setType]    = useState<ToolType>("LINK")
  const [content, setContent] = useState("")
  const [active,  setActive]  = useState(true)

  function openAdd() {
    setEditTool(null)
    setLabel(""); setDesc(""); setType("LINK"); setContent(""); setActive(true)
    setShowModal(true)
  }

  function openEdit(tool: DBTool) {
    setEditTool(tool)
    setLabel(tool.label); setDesc(tool.description ?? ""); setType(tool.type)
    setContent(tool.content); setActive(tool.active)
    setShowModal(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const body = { label, description: desc || undefined, type, content, active, committee }
    if (editTool) {
      const res = await fetch(`/api/committee-tools/${editTool.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ label, description: desc || undefined, type, content, active }),
      })
      if (res.ok) {
        const updated: DBTool = await res.json()
        setTools((prev) => prev.map((t) => t.id === updated.id ? updated : t))
      }
    } else {
      const res = await fetch("/api/committee-tools", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...body, order: tools.length }),
      })
      if (res.ok) {
        const created: DBTool = await res.json()
        setTools((prev) => [...prev, created])
      }
    }
    setSaving(false)
    setShowModal(false)
  }

  async function deleteTool(id: string) {
    setDeleting(id)
    const res = await fetch(`/api/committee-tools/${id}`, { method: "DELETE" })
    if (res.ok) setTools((prev) => prev.filter((t) => t.id !== id))
    setDeleting(null)
    setShowModal(false)
  }

  const inputCls   = "w-full px-3 py-2 text-body rounded-input border outline-none"
  const inputStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }

  const contentPlaceholder: Record<ToolType, string> = {
    LINK:         "/teacher/committee/it/qr-code",
    EMBED:        "https://example.com",
    HTML:         "<h1>Hello</h1>",
    GOOGLE_SHEET: "https://docs.google.com/spreadsheets/d/.../edit",
  }

  const shownTools = tools.filter((t) => canEdit || t.active)

  if (shownTools.length === 0 && !canEdit) return null

  return (
    <>
      {/* DB Tools section header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-h3" style={{ color: "var(--color-ink-700)" }}>自定工具</h3>
        {canEdit && (
          <button
            onClick={openAdd}
            className="text-caption px-3 py-1.5 rounded-input text-white"
            style={{ background: `var(--color-${colorVar})` }}
          >
            + 新增工具
          </button>
        )}
      </div>

      {shownTools.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {shownTools.map((tool) => {
            const href = tool.type === "LINK"
              ? tool.content
              : `/teacher/committee/${slug}/tools/${tool.id}`
            return (
              <div key={tool.id} className="relative group">
                <Link
                  href={href}
                  className="card p-5 block transition-shadow hover:shadow-card-md"
                  style={{ opacity: tool.active ? 1 : 0.6 }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-h3 mb-1 pr-6">{tool.label}</h3>
                      {tool.description && (
                        <p className="text-caption" style={{ color: "var(--color-ink-500)" }}>
                          {tool.description}
                        </p>
                      )}
                    </div>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                      style={{ background: "var(--color-surface-2)", color: "var(--color-ink-400)" }}
                    >
                      {TYPE_LABELS[tool.type]}
                    </span>
                  </div>
                  <p className="text-caption mt-3 font-medium"
                    style={{ color: `var(--color-${colorVar})` }}>
                    開啟 →
                  </p>
                </Link>
                {/* Star button — always visible on hover */}
                <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <FavoriteToolButton
                    toolKey={`ct:${tool.id}`}
                    initialFavorited={favoriteKeys.has(`ct:${tool.id}`)}
                    colorVar={colorVar}
                  />
                  {canEdit && (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); openEdit(tool) }}
                      className="text-caption px-2 py-0.5 rounded"
                      style={{ background: "var(--color-surface-2)", color: "var(--color-ink-500)" }}
                    >
                      ✎
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {canEdit && shownTools.length === 0 && (
        <div className="card p-6 text-center mb-6" style={{ color: "var(--color-ink-300)" }}>
          <p className="text-body">尚未新增自定工具</p>
        </div>
      )}

      {/* Add/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowModal(false)} />
          <form
            onSubmit={save}
            className="relative card p-6 w-full max-w-lg space-y-4 z-10 max-h-[90vh] overflow-y-auto"
          >
            <h3 className="text-h3">{editTool ? "編輯工具" : "新增工具"}</h3>

            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>名稱 *</label>
              <input required value={label} onChange={(e) => setLabel(e.target.value)}
                placeholder="工具名稱" className={inputCls} style={inputStyle} />
            </div>

            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>簡介（選填）</label>
              <input value={desc} onChange={(e) => setDesc(e.target.value)}
                placeholder="一句描述" className={inputCls} style={inputStyle} />
            </div>

            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>類型 *</label>
              <div className="grid grid-cols-2 gap-2">
                {(["LINK", "EMBED", "HTML", "GOOGLE_SHEET"] as ToolType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className="px-3 py-2 rounded-input text-caption text-left border transition-colors"
                    style={{
                      background: type === t ? "var(--color-accent-soft)" : "var(--color-surface-2)",
                      border:     `1px solid ${type === t ? "var(--color-accent)" : "var(--color-border)"}`,
                      color:      type === t ? "var(--color-accent)" : "var(--color-ink-700)",
                    }}
                  >
                    {TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              {type === "GOOGLE_SHEET" && (
                <p className="text-caption mt-1" style={{ color: "var(--color-ink-400)" }}>
                  貼上 Google Sheets 分享連結，系統自動轉換為嵌入格式
                </p>
              )}
            </div>

            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>
                {type === "HTML" ? "HTML 內容 *" : "連結 *"}
              </label>
              {type === "HTML" ? (
                <textarea
                  required
                  rows={6}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={contentPlaceholder[type]}
                  className={`${inputCls} resize-none font-mono text-caption`}
                  style={inputStyle}
                />
              ) : (
                <input
                  required
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={contentPlaceholder[type]}
                  className={inputCls}
                  style={inputStyle}
                />
              )}
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
              <span className="text-caption" style={{ color: "var(--color-ink-700)" }}>啟用（隱藏則只有管理員可見）</span>
            </label>

            <div className="flex gap-3 justify-between pt-2">
              {editTool && (
                <button
                  type="button"
                  disabled={deleting === editTool.id}
                  onClick={() => deleteTool(editTool.id)}
                  className="text-caption px-3 py-1.5 rounded-input"
                  style={{ color: "var(--color-discipline)" }}
                >
                  {deleting === editTool.id ? "刪除中…" : "刪除工具"}
                </button>
              )}
              <div className="flex gap-3 ml-auto">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-body rounded-input border"
                  style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}>
                  取消
                </button>
                <button type="submit" disabled={saving}
                  className="px-4 py-2 text-body font-medium rounded-input text-white"
                  style={{ background: "var(--color-accent)", opacity: saving ? 0.7 : 1 }}>
                  {saving ? "儲存中…" : "儲存"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
