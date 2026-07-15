"use client"

import { useState, useEffect, useRef } from "react"
import { AgentMarkdown } from "@/components/teacher/AgentMarkdown"

// ─── Types ────────────────────────────────────────────────────────────────────

type Template = {
  id:        string
  docType:   string
  name:      string
  content:   string
  isDefault: boolean
}

type Approval = {
  id:             string
  title:          string
  docType:        string
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED"
  createdAt:      string
  rejectionReason: string | null
  user:            { name: string | null; email: string | null }
  task:            { agentId: string } | null
}

type TimetableRow = {
  teacherName: string
  dayOfWeek:   number
  period:      number
  classCode:   string | null
  subject:     string | null
}

const DOC_TYPES = [
  "課程單元計劃", "教學筆記", "學習計劃", "活動計劃",
  "試卷", "工作紙",
  "報告", "其他",
  "代課通告", "家長通告", "採購申請", "活動報名表", "會議記錄",
  "分析報告",
]

const DAY_LABELS = ["", "一", "二", "三", "四", "五"]

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminAgentsPage() {
  const [tab, setTab] = useState<"templates" | "timetable" | "approvals">("templates")

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-h1 mb-1">AI 助理管理</h1>
      <p className="text-caption mb-6" style={{ color: "var(--color-ink-400)" }}>
        管理文件範本、課室時間表及待批核文件
      </p>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b" style={{ borderColor: "var(--color-border)" }}>
        {([
          { key: "templates",  label: "文件範本" },
          { key: "timetable",  label: "時間表"   },
          { key: "approvals",  label: "待批核"   },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="px-4 py-2 text-body -mb-px transition-colors"
            style={{
              color:        tab === t.key ? "var(--color-accent)"    : "var(--color-ink-500)",
              borderBottom: tab === t.key ? "2px solid var(--color-accent)" : "2px solid transparent",
              fontWeight:   tab === t.key ? 600 : 400,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "templates"  && <TemplatesTab />}
      {tab === "timetable"  && <TimetableTab />}
      {tab === "approvals"  && <ApprovalsTab />}
    </div>
  )
}

// ─── Templates Tab ────────────────────────────────────────────────────────────

function TemplatesTab() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading,   setLoading]   = useState(true)
  const [editing,   setEditing]   = useState<Template | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [saving,    setSaving]    = useState(false)

  // Form
  const [docType,   setDocType]   = useState(DOC_TYPES[0])
  const [name,      setName]      = useState("")
  const [content,   setContent]   = useState("")
  const [isDefault, setIsDefault] = useState(false)

  useEffect(() => {
    fetch("/api/agents/templates")
      .then((r) => r.ok ? r.json() : [])
      .then(setTemplates)
      .finally(() => setLoading(false))
  }, [])

  function openAdd() {
    setEditing(null)
    setDocType(DOC_TYPES[0]); setName(""); setContent(""); setIsDefault(false)
    setShowModal(true)
  }

  function openEdit(t: Template) {
    setEditing(t)
    setDocType(t.docType); setName(t.name); setContent(t.content); setIsDefault(t.isDefault)
    setShowModal(true)
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const body = { docType, name, content, isDefault }

    if (editing) {
      const res = await fetch(`/api/agents/templates/${editing.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      })
      if (res.ok) {
        const updated: Template = await res.json()
        setTemplates((prev) => prev.map((t) => t.id === updated.id ? updated : t))
      }
    } else {
      const res = await fetch("/api/agents/templates", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      })
      if (res.ok) {
        const created: Template = await res.json()
        setTemplates((prev) => [...prev, created])
      }
    }

    setSaving(false)
    setShowModal(false)
  }

  async function deleteTpl(id: string) {
    await fetch(`/api/agents/templates/${id}`, { method: "DELETE" })
    setTemplates((prev) => prev.filter((t) => t.id !== id))
    setShowModal(false)
  }

  const inputCls   = "w-full px-3 py-2 text-body rounded-input border outline-none"
  const inputStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }

  // Group by docType
  const grouped = DOC_TYPES.reduce<Record<string, Template[]>>((acc, dt) => {
    acc[dt] = templates.filter((t) => t.docType === dt)
    return acc
  }, {})

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>
          每個文件類型至少需要一個預設範本，助手才能生成正確格式的文件。
        </p>
        <button onClick={openAdd} className="text-caption px-3 py-1.5 rounded-input text-white"
          style={{ background: "var(--color-accent)" }}>
          + 新增範本
        </button>
      </div>

      {loading ? (
        <p className="text-body text-center py-12" style={{ color: "var(--color-ink-300)" }}>載入中…</p>
      ) : (
        <div className="space-y-6">
          {DOC_TYPES.map((dt) => (
            <div key={dt}>
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-h3" style={{ color: "var(--color-ink-700)" }}>{dt}</h3>
                {grouped[dt].length === 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--color-discipline)20", color: "var(--color-discipline)" }}>
                    缺少範本
                  </span>
                )}
              </div>
              {grouped[dt].length === 0 ? (
                <button onClick={() => { setDocType(dt); setName(""); setContent(""); setIsDefault(true); setEditing(null); setShowModal(true) }}
                  className="text-caption px-3 py-1.5 rounded-input border border-dashed"
                  style={{ borderColor: "var(--color-border)", color: "var(--color-ink-400)" }}>
                  + 建立 {dt} 範本
                </button>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {grouped[dt].map((t) => (
                    <div key={t.id} onClick={() => openEdit(t)}
                      className="card p-4 cursor-pointer hover:shadow-card-md transition-shadow">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-body font-medium truncate">{t.name}</p>
                        {t.isDefault && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0"
                            style={{ background: "var(--color-curriculum)20", color: "var(--color-curriculum)" }}>
                            預設
                          </span>
                        )}
                      </div>
                      <p className="text-caption mt-1 line-clamp-2" style={{ color: "var(--color-ink-400)" }}>
                        {t.content.slice(0, 100)}…
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowModal(false)} />
          <form onSubmit={save} className="relative card p-6 w-full max-w-2xl z-10 max-h-[90vh] overflow-y-auto space-y-4">
            <h3 className="text-h3">{editing ? "編輯範本" : "新增範本"}</h3>

            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>文件類型 *</label>
              <select value={docType} onChange={(e) => setDocType(e.target.value)}
                className={inputCls} style={inputStyle}>
                {DOC_TYPES.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>

            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>範本名稱 *</label>
              <input required value={name} onChange={(e) => setName(e.target.value)}
                placeholder="例：標準課程單元計劃" className={inputCls} style={inputStyle} />
            </div>

            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>
                範本內容 * <span style={{ color: "var(--color-ink-400)" }}>(Markdown 格式)</span>
              </label>
              <textarea required rows={12} value={content} onChange={(e) => setContent(e.target.value)}
                placeholder="# 文件標題&#10;&#10;**日期**：{{date}}&#10;**班別**：{{class}}&#10;&#10;## 內容&#10;{{content}}"
                className={`${inputCls} resize-y font-mono text-caption`} style={inputStyle} />
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
              <span className="text-caption" style={{ color: "var(--color-ink-700)" }}>設為此類型的預設範本</span>
            </label>

            <div className="flex gap-3 justify-between pt-2">
              {editing && (
                <button type="button" onClick={() => deleteTpl(editing.id)}
                  className="text-caption px-3 py-1.5 rounded-input"
                  style={{ color: "var(--color-discipline)" }}>
                  刪除範本
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
    </div>
  )
}

// ─── Timetable Tab ────────────────────────────────────────────────────────────

function TimetableTab() {
  const [term,     setTerm]     = useState("")
  const [csv,      setCsv]      = useState("")
  const [uploading, setUploading] = useState(false)
  const [result,   setResult]   = useState<{ imported: number; errors: string[] } | null>(null)
  const [error,    setError]    = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setCsv(reader.result as string)
    reader.readAsText(f, "UTF-8")
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault()
    if (!term.trim() || !csv.trim()) return
    setUploading(true)
    setResult(null)
    setError(null)

    const res = await fetch("/api/agents/timetable/upload", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ term: term.trim(), csv }),
    })

    const data = await res.json()
    if (res.ok) setResult(data)
    else setError(data?.error ?? `錯誤 ${res.status}`)
    setUploading(false)
  }

  const inputCls   = "w-full px-3 py-2 text-body rounded-input border outline-none"
  const inputStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }

  return (
    <div className="max-w-2xl">
      <p className="text-caption mb-6" style={{ color: "var(--color-ink-400)" }}>
        上載教師時間表 CSV，讓校務行政助手 Andy 可以查詢共同空堂及代課人選。
      </p>

      {/* Format guide */}
      <div className="card p-4 mb-6">
        <p className="text-caption font-medium mb-2" style={{ color: "var(--color-ink-700)" }}>CSV 格式</p>
        <pre className="text-caption font-mono" style={{ color: "var(--color-ink-600)", background: "var(--color-surface-2)", padding: "0.75rem", borderRadius: "0.5rem" }}>
{`teacherName,dayOfWeek,period,classCode,subject
陳大文,1,2,F.3A,英文
李小明,2,5,F.3B,數學
王老師,3,7,,`}
        </pre>
        <ul className="mt-2 space-y-0.5">
          {[
            "dayOfWeek：1-5（星期一至五）",
            "period：1-10",
            "classCode、subject 可留空",
            "上載後會清除同一學期的舊資料再重新匯入",
          ].map((s) => (
            <li key={s} className="text-caption flex items-start gap-1.5" style={{ color: "var(--color-ink-500)" }}>
              <span style={{ color: "var(--color-ink-300)" }}>·</span> {s}
            </li>
          ))}
        </ul>
      </div>

      <form onSubmit={upload} className="space-y-4">
        <div>
          <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>學期 *</label>
          <input required value={term} onChange={(e) => setTerm(e.target.value)}
            placeholder="例：2025-26 上學期" className={inputCls} style={inputStyle} />
        </div>

        <div>
          <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>CSV 檔案 *</label>
          <input type="file" accept=".csv,text/csv" ref={fileRef} onChange={onFile} className="hidden" />
          <button type="button" onClick={() => fileRef.current?.click()}
            className="text-caption px-3 py-1.5 rounded-input border mr-2"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-600)" }}>
            選擇 CSV 檔案
          </button>
          {csv && <span className="text-caption" style={{ color: "var(--color-ink-500)" }}>{csv.split("\n").length} 行已載入</span>}
        </div>

        {csv && (
          <div>
            <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>預覽（前 5 行）</label>
            <pre className="text-caption font-mono p-3 rounded-input overflow-x-auto"
              style={{ background: "var(--color-surface-2)", color: "var(--color-ink-600)" }}>
              {csv.split("\n").slice(0, 5).join("\n")}
            </pre>
          </div>
        )}

        {error  && <p className="text-caption" style={{ color: "var(--color-discipline)" }}>{error}</p>}

        {result && (
          <div className="card p-4" style={{ borderLeft: "3px solid var(--color-curriculum)" }}>
            <p className="text-body font-medium" style={{ color: "var(--color-curriculum)" }}>
              ✓ 成功匯入 {result.imported} 筆記錄
            </p>
            {result.errors.length > 0 && (
              <div className="mt-2">
                <p className="text-caption" style={{ color: "var(--color-discipline)" }}>
                  {result.errors.length} 行有問題（已略過）：
                </p>
                <ul className="mt-1 space-y-0.5">
                  {result.errors.slice(0, 5).map((e, i) => (
                    <li key={i} className="text-caption font-mono" style={{ color: "var(--color-ink-500)" }}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <button type="submit" disabled={uploading || !term.trim() || !csv.trim()}
          className="px-6 py-2 text-body font-medium rounded-input text-white"
          style={{ background: "var(--color-accent)", opacity: uploading || !term.trim() || !csv.trim() ? 0.6 : 1 }}>
          {uploading ? "上載中…" : "上載時間表"}
        </button>
      </form>
    </div>
  )
}

// ─── Approvals Tab ────────────────────────────────────────────────────────────

function ApprovalsTab() {
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading,   setLoading]   = useState(true)
  const [actioning, setActioning] = useState<string | null>(null)
  const [rejectId,  setRejectId]  = useState<string | null>(null)
  const [reason,    setReason]    = useState("")
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [bodies,    setBodies]    = useState<Record<string, string>>({})

  useEffect(() => {
    fetch("/api/agents/approvals")
      .then((r) => r.ok ? r.json() : [])
      .then(setApprovals)
      .finally(() => setLoading(false))
  }, [])

  async function toggleBody(id: string) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!bodies[id]) {
      const res = await fetch(`/api/agents/documents/${id}`)
      if (res.ok) {
        const doc = await res.json()
        setBodies((prev) => ({ ...prev, [id]: doc.content ?? "" }))
      }
    }
  }

  async function approve(id: string) {
    setActioning(id)
    const res = await fetch(`/api/agents/approvals/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "approve" }),
    })
    if (res.ok) setApprovals((prev) => prev.filter((a) => a.id !== id))
    setActioning(null)
  }

  async function reject(id: string) {
    if (!reason.trim()) return
    setActioning(id)
    const res = await fetch(`/api/agents/approvals/${id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ action: "reject", rejectionReason: reason }),
    })
    if (res.ok) setApprovals((prev) => prev.filter((a) => a.id !== id))
    setActioning(null)
    setRejectId(null)
    setReason("")
  }

  const pending = approvals.filter((a) => a.approvalStatus === "PENDING")

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>
          以下文件由 AI 助理生成，需要管理員批核後才能正式發出。
        </p>
        {pending.length > 0 && (
          <span className="text-caption px-2 py-0.5 rounded-pill text-white shrink-0"
            style={{ background: "var(--color-discipline)" }}>
            {pending.length} 待處理
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-body text-center py-12" style={{ color: "var(--color-ink-300)" }}>載入中…</p>
      ) : approvals.length === 0 ? (
        <div className="card p-8 text-center" style={{ color: "var(--color-ink-300)" }}>
          <p className="text-body">目前沒有待批核文件</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((a) => (
            <div key={a.id} className="card p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>{a.title}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded"
                      style={{ background: "var(--color-surface-2)", color: "var(--color-ink-400)" }}>
                      {a.docType}
                    </span>
                    {a.approvalStatus !== "PENDING" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{
                          background: a.approvalStatus === "APPROVED" ? "var(--color-curriculum)20" : "var(--color-discipline)20",
                          color:      a.approvalStatus === "APPROVED" ? "var(--color-curriculum)"   : "var(--color-discipline)",
                        }}>
                        {a.approvalStatus === "APPROVED" ? "已批核" : "已退回"}
                      </span>
                    )}
                  </div>
                  <p className="text-caption mt-0.5" style={{ color: "var(--color-ink-400)" }}>
                    {a.user.name ?? a.user.email} · {new Date(a.createdAt).toLocaleString("zh-HK")}
                  </p>
                  {a.rejectionReason && (
                    <p className="text-caption mt-1" style={{ color: "var(--color-discipline)" }}>
                      退回原因：{a.rejectionReason}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => toggleBody(a.id)}
                    className="text-caption px-3 py-1.5 rounded-input border"
                    style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-500)" }}>
                    {expanded === a.id ? "收合" : "檢視內容"}
                  </button>
                  {a.approvalStatus === "PENDING" && (
                    <>
                      <button
                        onClick={() => approve(a.id)}
                        disabled={actioning === a.id}
                        className="text-caption px-3 py-1.5 rounded-input text-white"
                        style={{ background: "var(--color-curriculum)", opacity: actioning === a.id ? 0.6 : 1 }}>
                        批核
                      </button>
                      <button
                        onClick={() => { setRejectId(a.id); setReason("") }}
                        disabled={actioning === a.id}
                        className="text-caption px-3 py-1.5 rounded-input"
                        style={{ background: "var(--color-discipline)15", color: "var(--color-discipline)" }}>
                        退回
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Inline document body */}
              {expanded === a.id && (
                <div className="mt-3 pt-3 border-t rounded-input p-3" style={{ borderColor: "var(--color-border)", background: "var(--color-surface-2)" }}>
                  {bodies[a.id] === undefined ? (
                    <p className="text-caption" style={{ color: "var(--color-ink-300)" }}>載入內容中…</p>
                  ) : (
                    <AgentMarkdown>{bodies[a.id]}</AgentMarkdown>
                  )}
                </div>
              )}

              {/* Inline reject reason input */}
              {rejectId === a.id && (
                <div className="mt-3 flex gap-2">
                  <input
                    autoFocus
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="退回原因（必填）"
                    className="flex-1 px-3 py-1.5 text-body rounded-input border outline-none"
                    style={{ border: "1px solid var(--color-discipline)", background: "var(--color-surface)", color: "var(--color-ink-900)" }}
                    onKeyDown={(e) => { if (e.key === "Enter") reject(a.id) }}
                  />
                  <button onClick={() => reject(a.id)} disabled={!reason.trim() || actioning === a.id}
                    className="text-caption px-3 py-1.5 rounded-input text-white"
                    style={{ background: "var(--color-discipline)", opacity: !reason.trim() ? 0.6 : 1 }}>
                    確認退回
                  </button>
                  <button onClick={() => setRejectId(null)} className="text-caption px-2 py-1.5 rounded-input"
                    style={{ color: "var(--color-ink-400)" }}>取消</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
