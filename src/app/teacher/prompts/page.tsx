"use client"

import { useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"

type Subject = "LESSON" | "MATERIAL" | "ASSESSMENT" | "FEEDBACK" | "PARENT" | "CLASSROOM" | "ADMIN" | "PD"
type PType   = "PLAN" | "CREATE" | "ASSESS" | "COMMUNICATE"

type Prompt = {
  id:          string
  subject:     Subject
  type:        PType
  title:       string
  tags:        string[]
  promptText:  string
  createdById: string | null
  createdBy:   { id: string; name: string | null } | null
}

const SUBJECTS: { id: Subject | "ALL"; label: string; color: string }[] = [
  { id: "ALL",        label: "全部",     color: "#1A202C" },
  { id: "LESSON",     label: "備課設計", color: "#1E88E5" },
  { id: "MATERIAL",   label: "教材製作", color: "#7E57C2" },
  { id: "ASSESSMENT", label: "評估工具", color: "#E53935" },
  { id: "FEEDBACK",   label: "學生反饋", color: "#F4511E" },
  { id: "PARENT",     label: "家長溝通", color: "#00ACC1" },
  { id: "CLASSROOM",  label: "課堂管理", color: "#2E7D32" },
  { id: "ADMIN",      label: "行政文書", color: "#546E7A" },
  { id: "PD",         label: "專業發展", color: "#8E24AA" },
]
const SUBJECT_MAP = new Map(SUBJECTS.map((s) => [s.id, s]))

const TYPE_META: Record<PType, { label: string; bg: string; color: string }> = {
  PLAN:        { label: "規劃", bg: "#EBF8FF", color: "#2B6CB0" },
  CREATE:      { label: "創作", bg: "#FFFFF0", color: "#744210" },
  ASSESS:      { label: "評估", bg: "#F0FFF4", color: "#276749" },
  COMMUNICATE: { label: "溝通", bg: "#FFF5F5", color: "#C53030" },
}
const TYPE_TABS: { id: PType | "ALL"; label: string }[] = [
  { id: "ALL", label: "全部" }, { id: "PLAN", label: "規劃" }, { id: "CREATE", label: "創作" },
  { id: "ASSESS", label: "評估" }, { id: "COMMUNICATE", label: "溝通" },
]

// ── Placeholder parsing (ported from js/app.js) ──────────────────────────────
const PH_RE = /【在此填上([^】]*)】/g

function extractPlaceholders(prompt: string): { key: string; hint: string }[] {
  const seen = new Set<string>()
  const result: { key: string; hint: string }[] = []
  let m: RegExpExecArray | null
  PH_RE.lastIndex = 0
  while ((m = PH_RE.exec(prompt)) !== null) {
    const hint = m[1].trim()
    const key  = hint || m[0]
    if (!seen.has(key)) { seen.add(key); result.push({ key, hint }) }
  }
  return result
}

function buildFilledPrompt(prompt: string, values: Record<string, string>): string {
  PH_RE.lastIndex = 0
  return prompt.replace(PH_RE, (match, hint) => {
    const key = (hint as string).trim() || match
    return values[key]?.trim() ? values[key].trim() : match
  })
}

// Split prompt into text/placeholder segments for the live-fill preview.
type Segment = { text: string; kind: "text" | "filled" | "empty" }

function renderFilledSegments(prompt: string, values: Record<string, string>): Segment[] {
  const segments: Segment[] = []
  let lastIdx = 0
  let m: RegExpExecArray | null
  PH_RE.lastIndex = 0
  while ((m = PH_RE.exec(prompt)) !== null) {
    if (m.index > lastIdx) segments.push({ text: prompt.slice(lastIdx, m.index), kind: "text" })
    const hint = m[1].trim()
    const key  = hint || m[0]
    const val  = values[key]?.trim()
    segments.push(val ? { text: val, kind: "filled" } : { text: m[0], kind: "empty" })
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < prompt.length) segments.push({ text: prompt.slice(lastIdx), kind: "text" })
  return segments
}

const emptyForm = () => ({ subject: "LESSON" as Subject, type: "PLAN" as PType, title: "", tagsInput: "", promptText: "" })

export default function PromptLibraryPage() {
  const { data: session } = useSession()
  const userId  = (session?.user as { id?: string } | undefined)?.id
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "ADMIN"

  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [loading, setLoading] = useState(true)

  const [subjectFilter, setSubjectFilter] = useState<Subject | "ALL">("ALL")
  const [typeFilter,    setTypeFilter]    = useState<PType | "ALL">("ALL")
  const [search,        setSearch]        = useState("")

  // Fill-in modal
  const [viewPrompt,  setViewPrompt]  = useState<Prompt | null>(null)
  const [modalValues, setModalValues] = useState<Record<string, string>>({})
  const [modalCopied, setModalCopied] = useState(false)
  const [rawCopiedId, setRawCopiedId] = useState<string | null>(null)

  // Add/edit modal
  const [editPrompt, setEditPrompt] = useState<Prompt | "new" | null>(null)
  const [form,       setForm]       = useState(emptyForm())
  const [saving,     setSaving]     = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [formErr,    setFormErr]    = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/prompts")
      .then((r) => r.ok ? r.json() : [])
      .then((d: Prompt[]) => setPrompts(d))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return prompts.filter((p) => {
      const matchSubject = subjectFilter === "ALL" || p.subject === subjectFilter
      const matchType    = typeFilter    === "ALL" || p.type    === typeFilter
      const matchSearch  = !q ||
        p.title.toLowerCase().includes(q) ||
        p.promptText.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      return matchSubject && matchType && matchSearch
    })
  }, [prompts, subjectFilter, typeFilter, search])

  function canManage(p: Prompt) {
    return !!userId && (p.createdById === userId || isAdmin)
  }

  function resetFilters() {
    setSubjectFilter("ALL"); setTypeFilter("ALL"); setSearch("")
  }

  // ── Fill-in modal ──────────────────────────────────────────────────────────
  function openView(p: Prompt) {
    setViewPrompt(p); setModalValues({}); setModalCopied(false)
  }
  function closeView() { setViewPrompt(null) }

  async function copyText(text: string, onDone: () => void) {
    try {
      await navigator.clipboard.writeText(text)
      onDone()
    } catch {
      const ta = document.createElement("textarea")
      ta.value = text
      ta.style.cssText = "position:fixed;top:-9999px;left:-9999px;opacity:0"
      document.body.appendChild(ta)
      ta.focus(); ta.select()
      try { document.execCommand("copy"); onDone() } catch { /* clipboard unavailable */ }
      document.body.removeChild(ta)
    }
  }

  function copyRaw(p: Prompt) {
    copyText(p.promptText, () => {
      setRawCopiedId(p.id)
      setTimeout(() => setRawCopiedId((cur) => (cur === p.id ? null : cur)), 2000)
    })
  }

  function copyFilled() {
    if (!viewPrompt) return
    const filled = buildFilledPrompt(viewPrompt.promptText, modalValues)
    copyText(filled, () => {
      setModalCopied(true)
      setTimeout(() => setModalCopied(false), 2000)
    })
  }

  // ── Add/edit modal ─────────────────────────────────────────────────────────
  function openAdd() {
    setFormErr(null); setForm(emptyForm()); setEditPrompt("new")
  }
  function openEdit(p: Prompt) {
    setFormErr(null)
    setForm({ subject: p.subject, type: p.type, title: p.title, tagsInput: p.tags.join(", "), promptText: p.promptText })
    setEditPrompt(p)
  }
  function closeManage() { setEditPrompt(null) }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setFormErr(null)
    const body = {
      subject:    form.subject,
      type:       form.type,
      title:      form.title.trim(),
      tags:       form.tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
      promptText: form.promptText,
    }
    const isNew = editPrompt === "new"
    const res = await fetch(isNew ? "/api/prompts" : `/api/prompts/${(editPrompt as Prompt).id}`, {
      method:  isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    })
    if (res.ok) {
      const saved: Prompt = await res.json()
      setPrompts((prev) => isNew ? [...prev, saved] : prev.map((p) => p.id === saved.id ? saved : p))
      setEditPrompt(null)
    } else {
      const d = await res.json().catch(() => ({}))
      setFormErr(d?.error ?? `儲存失敗 (${res.status})`)
    }
    setSaving(false)
  }

  async function remove() {
    if (editPrompt === "new" || !editPrompt) return
    if (!confirm(`確定要刪除「${editPrompt.title}」嗎？此操作無法復原。`)) return
    setDeleting(true)
    const res = await fetch(`/api/prompts/${editPrompt.id}`, { method: "DELETE" })
    if (res.ok) {
      setPrompts((prev) => prev.filter((p) => p.id !== (editPrompt as Prompt).id))
      setEditPrompt(null)
    } else {
      const d = await res.json().catch(() => ({}))
      setFormErr(d?.error ?? `刪除失敗 (${res.status})`)
    }
    setDeleting(false)
  }

  const inputCls   = "w-full px-3 py-2 text-body rounded-input border outline-none"
  const inputStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-h1">🏫 提示詞庫</h1>
          <p className="text-caption mt-1" style={{ color: "var(--color-ink-400)" }}>
            幫助教師備課、評估、溝通的 AI 提示詞工具 · 共 {prompts.length} 條提示詞
          </p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 text-body font-medium rounded-input text-white shrink-0"
          style={{ background: "var(--color-accent)" }}
        >
          ＋ 新增提示詞
        </button>
      </div>

      {/* Subject nav */}
      <div className="flex flex-wrap gap-2 mb-3">
        {SUBJECTS.map((s) => {
          const active = subjectFilter === s.id
          return (
            <button
              key={s.id}
              onClick={() => setSubjectFilter(s.id as Subject | "ALL")}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-caption font-medium rounded-pill border transition-colors"
              style={{
                background:  active ? s.color : "var(--color-surface)",
                color:       active ? "#fff"  : "var(--color-ink-700)",
                borderColor: active ? "transparent" : `${s.color}40`,
              }}
            >
              {s.id !== "ALL" && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: active ? "#fff" : s.color }} />}
              {s.label}
            </button>
          )
        })}
      </div>

      {/* Type tabs + search */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-4" style={{ borderBottom: "1px solid var(--color-border)" }}>
        <div className="flex gap-1 p-1 rounded-input" style={{ background: "var(--color-surface-2)" }}>
          {TYPE_TABS.map((t) => {
            const active = typeFilter === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTypeFilter(t.id as PType | "ALL")}
                className="px-3 py-1.5 text-caption font-medium rounded-input transition-colors"
                style={{
                  background: active ? "var(--color-surface)" : "transparent",
                  color:      active ? "var(--color-ink-900)" : "var(--color-ink-500)",
                  boxShadow:  active ? "0 1px 3px rgb(0 0 0 / 0.06)" : "none",
                }}
              >
                {t.label}
              </button>
            )
          })}
        </div>
        <div className="relative w-full sm:w-64">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-caption">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋提示詞標題或關鍵字…"
            className={`${inputCls} pl-8`}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Result summary */}
      <p className="text-caption mb-3" style={{ color: "var(--color-ink-400)" }}>
        {filtered.length === prompts.length ? `顯示全部 ${prompts.length} 條提示詞` : `顯示 ${filtered.length} / ${prompts.length} 條提示詞`}
      </p>

      {loading ? (
        <p className="text-body text-center py-12" style={{ color: "var(--color-ink-300)" }}>載入中…</p>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-h3 mb-1">🔎 找不到符合條件的提示詞</p>
          <button onClick={resetFilters} className="mt-3 px-4 py-2 text-body font-medium rounded-input"
            style={{ background: "var(--color-surface-2)", color: "var(--color-ink-700)" }}>
            重設篩選
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const subj = SUBJECT_MAP.get(p.subject)!
            const tm   = TYPE_META[p.type]
            return (
              <div key={p.id} className="card overflow-hidden flex flex-col">
                <div className="h-1.5" style={{ background: subj.color }} />
                <div className="p-4 flex flex-col gap-2 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="px-2 py-0.5 text-[11px] font-medium rounded-pill text-white" style={{ background: subj.color }}>{subj.label}</span>
                    <span className="px-2 py-0.5 text-[11px] font-medium rounded-pill" style={{ background: tm.bg, color: tm.color }}>{tm.label}</span>
                  </div>
                  <h3 className="text-h3">{p.title}</h3>
                  <p className="text-caption line-clamp-3" style={{ color: "var(--color-ink-500)" }}>
                    {p.promptText.slice(0, 180)}…
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.tags.map((t) => (
                      <span key={t} className="px-2 py-0.5 text-[11px] rounded-pill" style={{ background: "var(--color-surface-2)", color: "var(--color-ink-500)" }}>{t}</span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-auto pt-3">
                    <button onClick={() => openView(p)} className="flex-1 px-3 py-1.5 text-caption font-medium rounded-input text-white" style={{ background: "var(--color-accent)" }}>
                      🔍 查看＆填寫
                    </button>
                    <button onClick={() => copyRaw(p)} title="直接複製（不填關鍵字）"
                      className="px-2.5 py-1.5 text-caption rounded-input" style={{ background: "var(--color-surface-2)", color: "var(--color-ink-700)" }}>
                      {rawCopiedId === p.id ? "✅" : "📋"}
                    </button>
                    {canManage(p) && (
                      <button onClick={() => openEdit(p)} title="編輯"
                        className="px-2.5 py-1.5 text-caption rounded-input" style={{ background: "var(--color-surface-2)", color: "var(--color-ink-700)" }}>
                        ✏️
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Fill-in modal ── */}
      {viewPrompt && (() => {
        const subj = SUBJECT_MAP.get(viewPrompt.subject)!
        const tm   = TYPE_META[viewPrompt.type]
        const placeholders = extractPlaceholders(viewPrompt.promptText)
        const segments     = renderFilledSegments(viewPrompt.promptText, modalValues)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={closeView}>
            <div className="card w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-5" style={{ borderBottom: `4px solid ${subj.color}` }}>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="px-2 py-0.5 text-[11px] font-medium rounded-pill text-white" style={{ background: subj.color }}>{subj.label}</span>
                  <span className="px-2 py-0.5 text-[11px] font-medium rounded-pill" style={{ background: tm.bg, color: tm.color }}>{tm.label}</span>
                </div>
                <h2 className="text-h2">{viewPrompt.title}</h2>
              </div>

              <div className="p-5 space-y-4">
                {placeholders.length > 0 && (
                  <div>
                    <p className="text-caption font-semibold mb-2" style={{ color: "var(--color-ink-700)" }}>✏️ 填入你的資料，提示詞會即時更新：</p>
                    <div className="space-y-2">
                      {placeholders.map(({ key, hint }) => (
                        <div key={key}>
                          <label className="text-caption block mb-1" style={{ color: "var(--color-ink-500)" }}>{hint || key}</label>
                          <input
                            value={modalValues[key] ?? ""}
                            onChange={(e) => setModalValues((prev) => ({ ...prev, [key]: e.target.value }))}
                            placeholder={`例：${hint}`}
                            className={inputCls}
                            style={inputStyle}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-caption font-semibold mb-1" style={{ color: "var(--color-ink-700)" }}>
                    提示詞全文 <span className="font-normal" style={{ color: "var(--color-ink-400)" }}>（已填入的關鍵字會即時更新）</span>
                  </p>
                  <pre className="whitespace-pre-wrap text-caption p-3 rounded-input" style={{ background: "var(--color-surface-2)", color: "var(--color-ink-900)", fontFamily: "inherit" }}>
                    {segments.map((s, i) => {
                      if (s.kind === "filled") return <mark key={i} style={{ background: "#FEF08A", color: "inherit", borderRadius: 3, padding: "0 2px" }}>{s.text}</mark>
                      if (s.kind === "empty")  return <span key={i} style={{ color: "var(--color-ink-300)" }}>{s.text}</span>
                      return <span key={i}>{s.text}</span>
                    })}
                  </pre>
                </div>
              </div>

              <div className="p-5 pt-0 flex items-center justify-between gap-3">
                <button onClick={closeView} className="px-4 py-2 text-body rounded-input" style={{ color: "var(--color-ink-500)" }}>關閉</button>
                <button onClick={copyFilled} className="px-4 py-2 text-body font-medium rounded-input text-white" style={{ background: modalCopied ? "var(--color-curriculum)" : "var(--color-accent)" }}>
                  {modalCopied ? "✅ 已複製！" : "📋 複製完整提示詞"}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── Add/edit modal ── */}
      {editPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)" }} onClick={closeManage}>
          <form onSubmit={save} className="card w-full max-w-lg max-h-[85vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-h2">{editPrompt === "new" ? "新增提示詞" : "編輯提示詞"}</h2>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>分類</label>
                <select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value as Subject })} className={inputCls} style={inputStyle}>
                  {SUBJECTS.filter((s) => s.id !== "ALL").map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>類型</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as PType })} className={inputCls} style={inputStyle}>
                  {TYPE_TABS.filter((t) => t.id !== "ALL").map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>標題</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className={inputCls} style={inputStyle} required maxLength={200} />
            </div>

            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>標籤（用逗號分隔）</label>
              <input value={form.tagsInput} onChange={(e) => setForm({ ...form, tagsInput: e.target.value })} placeholder="教案, 學習目標, 課堂活動" className={inputCls} style={inputStyle} />
            </div>

            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>
                提示詞全文 <span style={{ color: "var(--color-ink-400)" }}>（用「【在此填上關鍵字】」標記可填寫的空白）</span>
              </label>
              <textarea
                value={form.promptText}
                onChange={(e) => setForm({ ...form, promptText: e.target.value })}
                rows={8}
                className={inputCls}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                required
                maxLength={4000}
              />
            </div>

            {formErr && <p className="text-caption" style={{ color: "var(--color-discipline)" }}>{formErr}</p>}

            <div className="flex items-center justify-between gap-3 pt-2">
              {editPrompt !== "new" ? (
                <button type="button" onClick={remove} disabled={deleting} className="px-3 py-2 text-caption font-medium rounded-input" style={{ color: "var(--color-discipline)" }}>
                  {deleting ? "刪除中…" : "🗑️ 刪除"}
                </button>
              ) : <span />}
              <div className="flex items-center gap-2">
                <button type="button" onClick={closeManage} className="px-4 py-2 text-body rounded-input" style={{ color: "var(--color-ink-500)" }}>取消</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-body font-medium rounded-input text-white" style={{ background: "var(--color-accent)", opacity: saving ? 0.7 : 1 }}>
                  {saving ? "儲存中…" : "儲存"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
