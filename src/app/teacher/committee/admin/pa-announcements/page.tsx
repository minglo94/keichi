"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { StatsRow, PAView } from "@/components/teacher/pa/StatsRow"
import { CalendarBoard } from "@/components/teacher/pa/CalendarBoard"
import {
  PAAnnouncement, Category, Priority, Status,
  PRIORITY_LABEL, STATUS_LABEL, formatDate, waShareUrl,
} from "@/components/teacher/pa/paTypes"

const VIEWS: { key: PAView; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "week",  label: "本週" },
  { key: "month", label: "本月" },
  { key: "all",   label: "全部" },
]

const inputCls   = "w-full px-3 py-2 text-body rounded-input border outline-none"
const inputStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }

function localNow(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
function toLocalISO(iso: string): string {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function PAAnnouncementsPage() {
  const [items,      setItems]      = useState<PAAnnouncement[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading,    setLoading]    = useState(true)
  const [view,       setView]       = useState<PAView>("today")

  // Compose / edit form
  const [showForm,   setShowForm]   = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [title,      setTitle]      = useState("")
  const [body,       setBody]       = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [priority,   setPriority]   = useState<Priority>("NORMAL")
  const [status,     setStatus]     = useState<Status>("PUBLISHED")
  const [publishAt,  setPublishAt]  = useState(localNow())
  const [pinned,     setPinned]     = useState(false)
  const [saving,     setSaving]     = useState(false)

  // New-category inline creator
  const [newCat,     setNewCat]     = useState("")
  const [addingCat,  setAddingCat]  = useState(false)

  // AI search
  const [showSearch, setShowSearch] = useState(false)
  const [query,      setQuery]      = useState("")
  const [answer,     setAnswer]     = useState("")
  const [searching,  setSearching]  = useState(false)

  // Import
  const fileRef = useRef<HTMLInputElement>(null)
  const [importMsg, setImportMsg] = useState("")

  async function load() {
    setLoading(true)
    const [aRes, cRes] = await Promise.all([
      fetch("/api/announcements"),
      fetch("/api/announcement-categories"),
    ])
    if (aRes.ok) setItems(await aRes.json())
    if (cRes.ok) setCategories(await cRes.json())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function resetForm() {
    setEditingId(null); setTitle(""); setBody(""); setCategoryId("")
    setPriority("NORMAL"); setStatus("PUBLISHED"); setPublishAt(localNow())
    setPinned(false); setShowForm(false)
  }

  function startEdit(a: PAAnnouncement) {
    setEditingId(a.id); setTitle(a.title); setBody(a.body)
    setCategoryId(a.category?.id ?? ""); setPriority(a.priority); setStatus(a.status)
    setPublishAt(toLocalISO(a.publishAt)); setPinned(a.pinned); setShowForm(true)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) return
    setSaving(true)
    const payload = {
      title, body, priority, status, pinned,
      categoryId: categoryId || undefined,
      publishAt:  new Date(publishAt).toISOString(),
    }
    const res = await fetch(editingId ? `/api/announcements/${editingId}` : "/api/announcements", {
      method:  editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    })
    setSaving(false)
    if (res.ok) {
      const saved = await res.json()
      setItems((prev) => editingId ? prev.map((a) => a.id === editingId ? saved : a) : [saved, ...prev])
      resetForm()
    }
  }

  async function addCategory() {
    const name = newCat.trim()
    if (!name) return
    setAddingCat(true)
    const res = await fetch("/api/announcement-categories", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ name }),
    })
    setAddingCat(false)
    if (res.ok) {
      const cat: Category = await res.json()
      setCategories((prev) => [...prev, cat])
      setCategoryId(cat.id)
      setNewCat("")
    } else {
      const err = await res.json().catch(() => ({}))
      alert(err.error ?? "新增分類失敗")
    }
  }

  async function remove(id: string) {
    if (!confirm("確定刪除此公告嗎？")) return
    setItems((prev) => prev.filter((a) => a.id !== id))
    await fetch(`/api/announcements/${id}`, { method: "DELETE" })
  }

  async function runSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true); setAnswer("")
    const res = await fetch("/api/pa-announcements/search", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ query }),
    })
    setSearching(false)
    const data = await res.json().catch(() => ({}))
    setAnswer(res.ok ? (data.answer ?? "") : (data.error ?? "搜尋失敗"))
  }

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportMsg("匯入中…")
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/api/pa-announcements/import", { method: "POST", body: fd })
    const data = await res.json().catch(() => ({}))
    if (fileRef.current) fileRef.current.value = ""
    if (res.ok) {
      setImportMsg(`已匯入 ${data.created} 則${data.errors?.length ? `，${data.errors.length} 則錯誤` : ""}`)
      await load()
    } else {
      setImportMsg(data.error ?? "匯入失敗")
    }
  }

  function renderCard(a: PAAnnouncement) {
    return (
      <div className="card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {a.pinned && (
                <span className="text-caption font-medium px-2 py-0.5 rounded-pill"
                  style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>📌 置頂</span>
              )}
              {a.category && (
                <span className="text-caption px-2 py-0.5 rounded-pill"
                  style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", color: "var(--color-ink-600)" }}>
                  {a.category.name}
                </span>
              )}
              <h3 className="text-h3">{a.title}</h3>
              {a.priority === "URGENT" && (
                <span className="text-caption font-bold px-2 py-0.5 rounded bg-red-100 text-red-600 border border-red-200">🚨 緊急</span>
              )}
              {a.priority === "IMPORTANT" && (
                <span className="text-caption font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-600 border border-amber-200">⭐ 重要</span>
              )}
              {a.status !== "PUBLISHED" && (
                <span className="text-caption px-2 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">{STATUS_LABEL[a.status]}</span>
              )}
            </div>
            <p className="text-body whitespace-pre-wrap mb-2" style={{ color: "var(--color-ink-700)" }}>{a.body}</p>
            <p className="text-caption" style={{ color: "var(--color-ink-300)" }}>
              {a.author?.name ?? "老師"} · {formatDate(a.publishAt)}
            </p>
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <a href={waShareUrl(a)} target="_blank" rel="noopener noreferrer"
              className="text-caption px-2.5 py-1 rounded-input border text-center hover:bg-gray-50"
              style={{ border: "1px solid var(--color-border)", color: "var(--color-curriculum)" }} title="WhatsApp 分享">💬</a>
            <button onClick={() => startEdit(a)}
              className="text-caption px-2.5 py-1 rounded-input border hover:bg-gray-50"
              style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-500)" }} title="編輯">✏️</button>
            <button onClick={() => remove(a.id)}
              className="text-caption px-2.5 py-1 rounded-input"
              style={{ color: "var(--color-ink-300)" }} title="刪除">×</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Link href="/teacher/committee/admin" className="text-caption" style={{ color: "var(--color-ink-400)" }}>← 行政</Link>
          <span style={{ color: "var(--color-ink-300)" }}>/</span>
          <h1 className="text-h1">早會廣播公告</h1>
        </div>
        <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>管理今日於早會 PA 廣播的公告，支援分類、AI 搜尋及 Excel 匯入匯出。</p>
      </div>

      {/* Stats */}
      <StatsRow announcements={items} active={view} onSelect={setView} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => { resetForm(); setShowForm((v) => !v) }}
          className="text-caption px-3 py-1.5 rounded-input text-white" style={{ background: "var(--color-admin)" }}>
          {showForm ? "取消" : "+ 新增公告"}
        </button>
        <button onClick={() => setShowSearch((v) => !v)}
          className="text-caption px-3 py-1.5 rounded-input border" style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-600)" }}>
          🔍 AI 搜尋
        </button>
        <button onClick={() => { window.location.href = "/api/pa-announcements/export" }}
          className="text-caption px-3 py-1.5 rounded-input border" style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-600)" }}>
          ⬇ 匯出 Excel
        </button>
        <button onClick={() => fileRef.current?.click()}
          className="text-caption px-3 py-1.5 rounded-input border" style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-600)" }}>
          ⬆ 匯入 Excel
        </button>
        <input ref={fileRef} type="file" accept=".xlsx" onChange={onImport} className="hidden" />
        {importMsg && <span className="text-caption" style={{ color: "var(--color-ink-500)" }}>{importMsg}</span>}
      </div>

      {/* AI search panel */}
      {showSearch && (
        <div className="card p-5 space-y-3">
          <form onSubmit={runSearch} className="flex gap-2">
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="例如：上星期有關考試的公告？" className={inputCls} style={inputStyle} />
            <button type="submit" disabled={searching}
              className="text-caption px-4 py-2 rounded-input text-white shrink-0" style={{ background: "var(--color-accent)", opacity: searching ? 0.7 : 1 }}>
              {searching ? "搜尋中…" : "搜尋"}
            </button>
          </form>
          {answer && <p className="text-body whitespace-pre-wrap" style={{ color: "var(--color-ink-700)" }}>{answer}</p>}
        </div>
      )}

      {/* Compose / edit form */}
      {showForm && (
        <form onSubmit={submit} className="card p-5 space-y-4">
          <h3 className="text-h3">{editingId ? "編輯公告" : "新增公告"}</h3>
          <div>
            <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>標題 *</label>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="公告標題" className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>內容 *</label>
            <textarea required rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder="廣播內容" className={`${inputCls} resize-none`} style={inputStyle} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>分類</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls} style={inputStyle}>
                <option value="">— 未分類 —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="flex gap-2 mt-2">
                <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="新增自訂分類" className={`${inputCls} text-caption`} style={inputStyle} />
                <button type="button" onClick={addCategory} disabled={addingCat}
                  className="text-caption px-3 rounded-input border shrink-0" style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-600)" }}>
                  {addingCat ? "…" : "新增"}
                </button>
              </div>
            </div>
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>優先級</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={inputCls} style={inputStyle}>
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>狀態</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className={inputCls} style={inputStyle}>
                {(Object.keys(STATUS_LABEL) as Status[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
              </select>
            </div>
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>廣播日期</label>
              <input type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} className={inputCls} style={inputStyle} />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="w-4 h-4" />
            <span className="text-body" style={{ color: "var(--color-ink-700)" }}>置頂公告</span>
          </label>
          <div className="flex justify-end gap-3 pt-2">
            {editingId && (
              <button type="button" onClick={resetForm}
                className="text-body font-medium px-6 py-2 rounded-input border" style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-500)" }}>取消編輯</button>
            )}
            <button type="submit" disabled={saving}
              className="text-body font-medium px-6 py-2 rounded-input text-white" style={{ background: "var(--color-admin)", opacity: saving ? 0.7 : 1 }}>
              {saving ? "儲存中…" : editingId ? "更新" : "發佈"}
            </button>
          </div>
        </form>
      )}

      {/* View switcher */}
      <div className="flex gap-1">
        {VIEWS.map((v) => (
          <button key={v.key} onClick={() => setView(v.key)}
            className="text-caption px-3 py-1.5 rounded-input border"
            style={{
              border: "1px solid var(--color-border)",
              background: view === v.key ? "var(--color-admin)" : "var(--color-surface)",
              color:      view === v.key ? "#fff" : "var(--color-ink-600)",
            }}>
            {v.label}
          </button>
        ))}
      </div>

      {/* Board */}
      {loading
        ? <div className="text-center py-12 text-body" style={{ color: "var(--color-ink-300)" }}>載入中…</div>
        : <CalendarBoard announcements={items} view={view} renderItem={renderCard} />}
    </div>
  )
}
