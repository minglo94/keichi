"use client"

import { useEffect, useState } from "react"
import { CommitteeBadge } from "@/components/teacher/CommitteeBadge"

type CommitteeType = "ADMIN" | "DISCIPLINE" | "IT" | "CURRICULUM" | "ECA"
type Target        = "ALL" | "ADMIN" | "DISCIPLINE" | "IT" | "CURRICULUM" | "ECA" | "CLASS"
type Priority      = "NORMAL" | "IMPORTANT" | "URGENT"

type Announcement = {
  id:        string
  title:     string
  body:      string
  committee: CommitteeType | null
  target:    Target
  pinned:    boolean
  priority:  Priority
  classId:   string | null
  publishAt: string
  createdAt: string
  author:    { id: string; name: string | null; image: string | null }
}

const TARGET_OPTIONS: { label: string; value: Target }[] = [
  { label: "全校",     value: "ALL"        },
  { label: "班別",     value: "CLASS"      },
  { label: "行政",     value: "ADMIN"      },
  { label: "訓育",     value: "DISCIPLINE" },
  { label: "資訊科技", value: "IT"         },
  { label: "課程發展", value: "CURRICULUM" },
  { label: "課外活動", value: "ECA"        },
]

const PRIORITY_OPTIONS: { label: string; value: Priority }[] = [
  { label: "普通", value: "NORMAL" },
  { label: "重要", value: "IMPORTANT" },
  { label: "緊急", value: "URGENT" },
]

function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}年${d.getMonth()+1}月${d.getDate()}日`
}

function toLocalISO(dateStr: string): string {
  const d = new Date(dateStr)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [classes,       setClasses]       = useState<{ id: string; name: string }[]>([])
  const [loading,       setLoading]       = useState(true)
  const [showForm,      setShowForm]      = useState(false)
  const [editingId,     setEditingId]     = useState<string | null>(null)

  // Form state
  const [title,   setTitle]   = useState("")
  const [body,    setBody]    = useState("")
  const [target,  setTarget]  = useState<Target>("ALL")
  const [classId, setClassId] = useState("")
  const [priority, setPriority] = useState<Priority>("NORMAL")
  const [pinned,       setPinned]       = useState(false)
  const [publishAt,    setPublishAt]    = useState(new Date().toISOString().slice(0, 16))
  const [syncToGoogle, setSyncToGoogle] = useState(false)
  const [saving,       setSaving]       = useState(false)

  async function load() {
    setLoading(true)
    const [aRes, cRes] = await Promise.all([
      fetch("/api/announcements"),
      fetch("/api/admin/classes")
    ])
    if (aRes.ok) setAnnouncements(await aRes.json())
    if (cRes.ok) setClasses(await cRes.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Deep link from the dashboard's 今日公告 card (/teacher/announcements#ann-<id>):
  // once the list has rendered, scroll that announcement into view and flash it
  // so it's obvious which one was clicked.
  useEffect(() => {
    if (loading || announcements.length === 0) return
    const id = window.location.hash.slice(1)
    if (!id) return
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    el.style.transition = "box-shadow .3s"
    el.style.boxShadow  = "0 0 0 3px var(--color-accent)"
    const t = setTimeout(() => { el.style.boxShadow = "" }, 2000)
    return () => clearTimeout(t)
  }, [loading, announcements])

  async function publish(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const payload = { 
      title, 
      body, 
      target, 
      priority, 
      pinned, 
      syncToGoogle, 
      publishAt: new Date(publishAt).toISOString(),
      classId: target === "CLASS" ? classId : undefined 
    }

    const res = await fetch(editingId ? `/api/announcements/${editingId}` : "/api/announcements", {
      method:  editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      const result = await res.json()
      if (editingId) {
        setAnnouncements((prev) => prev.map(a => a.id === editingId ? result : a))
      } else {
        setAnnouncements((prev) => [result, ...prev])
      }
      resetForm()
    }
    setSaving(false)
  }

  function resetForm() {
    setTitle(""); setBody(""); setTarget("ALL"); setPriority("NORMAL"); setClassId(""); 
    setPinned(false); setSyncToGoogle(false); setShowForm(false); setEditingId(null);
    setPublishAt(new Date().toISOString().slice(0, 16))
  }

  function startEdit(ann: Announcement) {
    setEditingId(ann.id)
    setTitle(ann.title)
    setBody(ann.body)
    setTarget(ann.target)
    setPriority(ann.priority)
    setPinned(ann.pinned)
    setClassId(ann.classId ?? "")
    setPublishAt(toLocalISO(ann.publishAt))
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function deleteAnn(id: string) {
    if (!confirm("確定刪除嗎？")) return
    setAnnouncements((prev) => prev.filter((a) => a.id !== id))
    await fetch(`/api/announcements/${id}`, { method: "DELETE" })
  }

  async function togglePin(ann: Announcement) {
    setAnnouncements((prev) => prev.map((a) => a.id === ann.id ? { ...a, pinned: !a.pinned } : a))
    await fetch(`/api/announcements/${ann.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: !ann.pinned }),
    })
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-h1">公告</h1>
          <p className="text-body mt-0.5" style={{ color: "var(--color-ink-500)" }}>
            校內及班級通告發布
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 rounded-input text-body font-medium text-white transition-colors"
          style={{ background: "var(--color-accent)" }}
        >
          {showForm ? "取消" : "+ 發佈公告"}
        </button>
      </div>

      {/* Compose form */}
      {showForm && (
        <form onSubmit={publish} className="card p-5 mb-6 space-y-4">
          <h3 className="text-h3">發佈新公告</h3>
          <div>
            <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>標題 *</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="公告標題"
              className="w-full px-3 py-2 text-body rounded-input border"
              style={{
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-ink-900)",
              }}
            />
          </div>
          <div>
            <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>內容 *</label>
            <textarea
              required
              rows={5}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="公告內容"
              className="w-full px-3 py-2 text-body rounded-input border resize-none"
              style={{
                border: "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color: "var(--color-ink-900)",
              }}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>目標受眾</label>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value as Target)}
                className="w-full px-3 py-2 text-body rounded-input border"
                style={{
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface)",
                  color: "var(--color-ink-900)",
                }}
              >
                {TARGET_OPTIONS.map(({ label, value }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            {target === "CLASS" && (
              <div>
                <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>選擇班別</label>
                <select
                  required
                  value={classId}
                  onChange={(e) => setClassId(e.target.value)}
                  className="w-full px-3 py-2 text-body rounded-input border"
                  style={{
                    border: "1px solid var(--color-border)",
                    background: "var(--color-surface)",
                    color: "var(--color-ink-900)",
                  }}
                >
                  <option value="">— 請選擇 —</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>重要性</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
                className="w-full px-3 py-2 text-body rounded-input border"
                style={{
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface)",
                  color: "var(--color-ink-900)",
                }}
              >
                {PRIORITY_OPTIONS.map(({ label, value }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>發佈日期</label>
              <input
                type="datetime-local"
                value={publishAt}
                onChange={(e) => setPublishAt(e.target.value)}
                className="w-full px-3 py-2 text-body rounded-input border"
                style={{
                  border: "1px solid var(--color-border)",
                  background: "var(--color-surface)",
                  color: "var(--color-ink-900)",
                }}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={pinned}
              onChange={(e) => setPinned(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-body" style={{ color: "var(--color-ink-700)" }}>置頂公告</span>
          </label>
          <div className="flex justify-end pt-2 gap-3">
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-6 py-2 text-body font-medium rounded-input border w-full sm:w-auto hover:bg-gray-50 transition-colors"
                style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-500)" }}
              >
                取消編輯
              </button>
            )}
            <button
              type="submit"
              disabled={saving || (target === "CLASS" && !classId)}
              className="px-6 py-2 text-body font-medium rounded-input text-white w-full sm:w-auto"
              style={{ background: "var(--color-accent)", opacity: saving ? 0.7 : 1 }}
            >
              {saving ? (editingId ? "更新中…" : "發佈中…") : (editingId ? "更新公告" : "發佈")}
            </button>
          </div>
        </form>
      )}

      {/* Announcement list */}
      {loading ? (
        <div className="text-center py-12 text-body" style={{ color: "var(--color-ink-300)" }}>載入中…</div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-12 text-body" style={{ color: "var(--color-ink-300)" }}>暫無公告</div>
      ) : (
        <ul className="space-y-3">
          {announcements.map((ann) => (
            <li key={ann.id} id={`ann-${ann.id}`} className="card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {ann.pinned && (
                      <span
                        className="text-caption font-medium px-2 py-0.5 rounded-pill"
                        style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
                      >
                        📌 置頂
                      </span>
                    )}
                    <h3 className="text-h3">{ann.title}</h3>
                    {ann.priority === "URGENT" && (
                      <span className="text-caption font-bold px-2 py-0.5 rounded bg-red-100 text-red-600 border border-red-200 animate-pulse">
                        🚨 緊急
                      </span>
                    )}
                    {ann.priority === "IMPORTANT" && (
                      <span className="text-caption font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-600 border border-amber-200">
                        ⭐ 重要
                      </span>
                    )}
                    {ann.target === "CLASS" ? (
                      <span className="text-caption px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200">
                        班別公告
                      </span>
                    ) : (
                      <>
                        {ann.committee && <CommitteeBadge committee={ann.committee} />}
                        {ann.target !== "ALL" && !ann.committee && (
                          <CommitteeBadge committee={ann.target as CommitteeType} />
                        )}
                      </>
                    )}
                  </div>
                  <p className="text-body whitespace-pre-wrap mb-2" style={{ color: "var(--color-ink-700)" }}>
                    {ann.body}
                  </p>
                  <p className="text-caption" style={{ color: "var(--color-ink-300)" }}>
                    {ann.author.name ?? "老師"} · {formatDate(ann.publishAt)}
                    {new Date(ann.publishAt) > new Date() && (
                      <span className="ml-2 text-blue-500 font-medium">預約發佈</span>
                    )}
                  </p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={() => startEdit(ann)}
                    className="text-caption px-2.5 py-1 rounded-input border transition-colors hover:bg-gray-50"
                    style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-500)" }}
                    title="編輯"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => togglePin(ann)}
                    className="text-caption px-2.5 py-1 rounded-input border transition-colors"
                    style={{
                      border: "1px solid var(--color-border)",
                      color: ann.pinned ? "var(--color-accent)" : "var(--color-ink-500)",
                    }}
                    title={ann.pinned ? "取消置頂" : "置頂"}
                  >
                    📌
                  </button>
                  <button
                    onClick={() => deleteAnn(ann.id)}
                    className="text-caption px-2.5 py-1 rounded-input transition-colors hover:bg-[var(--color-discipline-soft)]"
                    style={{ color: "var(--color-ink-300)" }}
                    title="刪除"
                  >
                    ×
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
