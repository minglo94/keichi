"use client"

import { useEffect, useState, useRef } from "react"
import Link from "next/link"
import {
  BEHAVIOR_LABEL, BEHAVIOR_COLOR, BEHAVIOR_ORDER, type BehaviorTypeValue,
} from "@/lib/behavior-types"

type BehaviorRecord = {
  id:          string
  date:        string
  className:   string
  studentName: string
  type:        BehaviorTypeValue
  description: string
  action:      string | null
  resolved:    boolean
  authorId:    string
  createdAt:   string
  author:      { id: string; name: string | null }
}

type HomeroomClass = {
  className: string
  students: { studentName: string; classNumber: string | null }[]
}

type Filter = "ALL" | "UNRESOLVED" | "RESOLVED"

function formatDate(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

export default function BehaviorPage() {
  const [records,     setRecords]     = useState<BehaviorRecord[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [editingId,   setEditingId]   = useState<string | null>(null)
  const [filter,      setFilter]      = useState<Filter>("ALL")
  const [typeFilter,  setTypeFilter]  = useState<BehaviorTypeValue | "ALL">("ALL")
  const [classFilter, setClassFilter] = useState("")
  const [saving,      setSaving]      = useState(false)
  const [importMsg,   setImportMsg]   = useState<string | null>(null)
  const [emailBusy,   setEmailBusy]   = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Homeroom classes + rosters (for the dropdown + student multi-select)
  const [hrClasses, setHrClasses] = useState<HomeroomClass[]>([])
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])
  const [studentQuery, setStudentQuery] = useState("")

  // Form state
  const [date,        setDate]        = useState(new Date().toISOString().slice(0, 10))
  const [className,   setClassName]   = useState("")
  const [studentName, setStudentName] = useState("")   // used in edit mode only
  const [type,        setType]        = useState<BehaviorTypeValue>("DEMERIT")
  const [description, setDescription] = useState("")
  const [action,      setAction]      = useState("")

  useEffect(() => {
    fetch("/api/homeroom")
      .then((r) => r.ok ? r.json() : { classes: [] })
      .then((d) => setHrClasses(d.classes ?? []))
      .catch(() => {})
  }, [])

  const roster = hrClasses.find((c) => c.className === className)?.students ?? []

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (filter === "UNRESOLVED") params.set("resolved", "false")
    if (filter === "RESOLVED")   params.set("resolved", "true")
    if (typeFilter !== "ALL")    params.set("type", typeFilter)
    if (classFilter)             params.set("className", classFilter)
    const res = await fetch(`/api/behavior-records?${params}`)
    if (res.ok) setRecords(await res.json())
    setLoading(false)
  }
  useEffect(() => { load() }, [filter, typeFilter, classFilter]) // eslint-disable-line

  function resetForm() {
    setEditingId(null); setDate(new Date().toISOString().slice(0, 10))
    setClassName(""); setStudentName(""); setSelectedStudents([]); setStudentQuery("")
    setType("DEMERIT"); setDescription(""); setAction("")
  }

  function openEdit(r: BehaviorRecord) {
    setEditingId(r.id)
    setDate(r.date.slice(0, 10)); setClassName(r.className); setStudentName(r.studentName)
    setSelectedStudents([])
    setType(r.type); setDescription(r.description); setAction(r.action ?? "")
    setShowForm(true)
  }

  function toggleStudent(name: string) {
    setSelectedStudents((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name])
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    if (editingId) {
      const body = JSON.stringify({ date, className, studentName, type, description, action: action || undefined })
      const res = await fetch(`/api/behavior-records/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body })
      if (res.ok) {
        const saved: BehaviorRecord = await res.json()
        setRecords((prev) => prev.map((r) => r.id === saved.id ? saved : r))
        resetForm(); setShowForm(false)
      }
      setSaving(false)
      return
    }

    // Create: one record per selected student from the roster.
    const names = selectedStudents
    if (!className || names.length === 0) { setSaving(false); return }

    const created: BehaviorRecord[] = []
    for (const name of names) {
      const res = await fetch("/api/behavior-records", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, className, studentName: name, type, description, action: action || undefined }),
      })
      if (res.ok) created.push(await res.json())
    }
    if (created.length) {
      setRecords((prev) => [...created, ...prev])
      setImportMsg(`已新增 ${created.length} 筆記錄`)
      setTimeout(() => setImportMsg(null), 4000)
      resetForm(); setShowForm(false)
    }
    setSaving(false)
  }

  async function toggleResolved(record: BehaviorRecord) {
    const res = await fetch(`/api/behavior-records/${record.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolved: !record.resolved }),
    })
    if (res.ok) {
      const updated: BehaviorRecord = await res.json()
      setRecords((prev) => prev.map((r) => r.id === updated.id ? updated : r))
    }
  }

  async function deleteRecord(id: string) {
    setRecords((prev) => prev.filter((r) => r.id !== id))
    await fetch(`/api/behavior-records/${id}`, { method: "DELETE" })
  }

  async function emailTeacher(r: BehaviorRecord) {
    setEmailBusy(r.id)
    const res = await fetch("/api/behavior-records/email-teacher", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ className: r.className, studentName: r.studentName }),
    })
    const data = await res.json().catch(() => ({}))
    setEmailBusy(null)
    setImportMsg(res.ok ? `已電郵通知 ${r.className} 班主任（${data.sentTo}）` : `✗ ${data.error ?? "電郵發送失敗"}`)
    setTimeout(() => setImportMsg(null), 5000)
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportMsg("匯入中…")
    const fd = new FormData()
    fd.append("file", file)
    const res = await fetch("/api/behavior-records/import", { method: "POST", body: fd })
    const data = await res.json().catch(() => ({}))
    if (fileRef.current) fileRef.current.value = ""
    if (res.ok) {
      setImportMsg(`✓ 匯入 ${data.created} 筆${data.errors?.length ? `，${data.errors.length} 行有問題` : ""}`)
      load()
    } else {
      setImportMsg(`✗ ${data.error ?? "匯入失敗"}`)
    }
    setTimeout(() => setImportMsg(null), 6000)
  }

  const inputCls   = "w-full px-3 py-2 text-body rounded-input border outline-none"
  const inputStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <Link href="/teacher/committee/discipline" className="text-caption" style={{ color: "var(--color-ink-400)" }}>← 訓育</Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">行為記錄</h1>
        <div className="ml-auto flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onImportFile} className="hidden" />
          <button onClick={() => fileRef.current?.click()}
            className="text-caption px-3 py-2 rounded-input border"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-500)" }}>
            ⬆ 匯入 CSV
          </button>
          <a href="/api/behavior-records/export"
            className="text-caption px-3 py-2 rounded-input border"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-500)" }}>
            ⬇ 匯出
          </a>
          <button onClick={() => { resetForm(); setShowForm((v) => !v) }}
            className="px-4 py-2 rounded-input text-body font-medium text-white"
            style={{ background: "var(--color-accent)" }}>
            + 新增
          </button>
        </div>
      </div>

      {importMsg && (
        <div className="mb-4 p-2.5 rounded-input text-caption"
          style={{ background: "var(--color-surface-2)", color: "var(--color-ink-700)" }}>
          {importMsg}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <form onSubmit={save} className="card p-5 mb-6 space-y-4">
          <h3 className="text-h3">{editingId ? "編輯行為記錄" : "新增行為記錄"}</h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>日期 *</label>
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>類別 *</label>
              <select required value={type} onChange={(e) => setType(e.target.value as BehaviorTypeValue)} className={inputCls} style={inputStyle}>
                {BEHAVIOR_ORDER.map((t) => <option key={t} value={t}>{BEHAVIOR_LABEL[t]}</option>)}
              </select>
            </div>
          </div>

          {/* Class + students */}
          {editingId ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>班別 *</label>
                <input required value={className} onChange={(e) => setClassName(e.target.value)} placeholder="如：4A" className={inputCls} style={inputStyle} />
              </div>
              <div>
                <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>學生姓名 *</label>
                <input required value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="學生全名" className={inputCls} style={inputStyle} />
              </div>
            </div>
          ) : (
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>班別 *</label>
              <select required value={className} onChange={(e) => { setClassName(e.target.value); setSelectedStudents([]); setStudentQuery("") }} className={inputCls} style={inputStyle}>
                <option value="">選擇班別…</option>
                {hrClasses.map((c) => <option key={c.className} value={c.className}>{c.className}</option>)}
              </select>

              {className && (
                <div className="mt-3">
                  <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>
                    學生 *（可多選，已選 {selectedStudents.length}）
                  </label>
                  {roster.length === 0 ? (
                    <p className="text-caption p-2 rounded-input" style={{ background: "var(--color-surface-2)", color: "var(--color-ink-400)" }}>
                      此班尚無學生名單。請先讓學生透過班級代碼加入此班。
                    </p>
                  ) : (
                    <>
                      {selectedStudents.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {selectedStudents.map((name) => (
                            <button type="button" key={name} onClick={() => toggleStudent(name)}
                              className="text-caption px-2.5 py-1 rounded-input border flex items-center gap-1"
                              style={{ background: "var(--color-accent)", color: "white", border: "1px solid var(--color-accent)" }}>
                              {name} <span style={{ opacity: 0.8 }}>✕</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <input
                        type="text"
                        value={studentQuery}
                        onChange={(e) => setStudentQuery(e.target.value)}
                        placeholder={`搜尋 ${roster.length} 位學生…`}
                        className={`${inputCls} mb-2`}
                        style={inputStyle}
                      />
                      <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-1">
                        {roster
                          .filter((s) => s.studentName.toLowerCase().includes(studentQuery.trim().toLowerCase()))
                          .map((s) => {
                            const on = selectedStudents.includes(s.studentName)
                            return (
                              <button type="button" key={s.studentName} onClick={() => toggleStudent(s.studentName)}
                                className="text-caption px-2.5 py-1 rounded-input border transition-colors"
                                style={{
                                  background: on ? "var(--color-accent)" : "var(--color-surface)",
                                  color:      on ? "white" : "var(--color-ink-700)",
                                  border:     `1px solid ${on ? "var(--color-accent)" : "var(--color-border)"}`,
                                }}>
                                {s.classNumber ? `${s.classNumber}. ` : ""}{s.studentName}
                              </button>
                            )
                          })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>事件描述 *</label>
            <textarea required rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="詳細描述事件經過" className={`${inputCls} resize-none`} style={inputStyle} />
          </div>

          <div>
            <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>跟進行動（選填）</label>
            <textarea rows={2} value={action} onChange={(e) => setAction(e.target.value)} placeholder="已採取的跟進措施" className={`${inputCls} resize-none`} style={inputStyle} />
          </div>

          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => { setShowForm(false); resetForm() }}
              className="px-4 py-2 text-body rounded-input border"
              style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}>取消</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-body font-medium rounded-input text-white"
              style={{ background: "var(--color-accent)", opacity: saving ? 0.7 : 1 }}>
              {saving ? "儲存中…" : "儲存"}
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="space-y-3 mb-4">
        <div className="flex gap-2 flex-wrap">
          {(["ALL", "UNRESOLVED", "RESOLVED"] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-pill text-caption font-medium border transition-colors"
              style={{
                background: filter === f ? "var(--color-ink-900)" : "var(--color-surface)",
                color:      filter === f ? "white" : "var(--color-ink-700)",
                border:     "1px solid var(--color-border)",
              }}>
              {f === "ALL" ? "全部" : f === "UNRESOLVED" ? "未處理" : "已處理"}
            </button>
          ))}
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as BehaviorTypeValue | "ALL")}
            className="px-3 py-1.5 rounded-pill text-caption border"
            style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-700)" }}>
            <option value="ALL">全部類別</option>
            {BEHAVIOR_ORDER.map((t) => <option key={t} value={t}>{BEHAVIOR_LABEL[t]}</option>)}
          </select>
          <input value={classFilter} onChange={(e) => setClassFilter(e.target.value)} placeholder="篩選班別…"
            className="px-3 py-1.5 text-caption rounded-pill border outline-none w-32"
            style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }} />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-12 text-body" style={{ color: "var(--color-ink-300)" }}>載入中…</div>
      ) : records.length === 0 ? (
        <div className="text-center py-12 text-body" style={{ color: "var(--color-ink-300)" }}>暫無記錄</div>
      ) : (
        <ul className="space-y-2">
          {records.map((record) => {
            const color = BEHAVIOR_COLOR[record.type]
            return (
              <li key={record.id} className="card pl-4 pr-4 py-3"
                style={{ borderLeft: `3px solid ${color}`, opacity: record.resolved ? 0.65 : 1 }}>
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-caption px-2 py-0.5 rounded-pill font-medium"
                        style={{ background: `${color}20`, color }}>
                        {BEHAVIOR_LABEL[record.type]}
                      </span>
                      <span className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>
                        {record.className} · {record.studentName}
                      </span>
                      <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>{formatDate(record.date)}</span>
                      {record.resolved && (
                        <span className="text-caption px-2 py-0.5 rounded-pill"
                          style={{ background: "var(--color-surface-2)", color: "var(--color-ink-400)" }}>已處理</span>
                      )}
                    </div>
                    <p className="text-caption" style={{ color: "var(--color-ink-700)" }}>{record.description}</p>
                    {record.action && <p className="text-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>跟進：{record.action}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => emailTeacher(record)} disabled={emailBusy === record.id}
                      className="text-caption px-2 py-1 rounded-input border" title="電郵通知班主任"
                      style={{ border: "1px solid var(--color-border)", color: "var(--color-accent)" }}>
                      {emailBusy === record.id ? "…" : "✉ 班主任"}
                    </button>
                    <button onClick={() => openEdit(record)}
                      className="text-caption px-2 py-1 rounded-input border"
                      style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}>編輯</button>
                    <button onClick={() => toggleResolved(record)}
                      className="text-caption px-2 py-1 rounded-input border"
                      style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}>
                      {record.resolved ? "重開" : "已處理"}
                    </button>
                    <button onClick={() => deleteRecord(record.id)}
                      className="text-caption px-1.5 py-1 rounded-input" style={{ color: "var(--color-ink-300)" }} title="刪除">×</button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
