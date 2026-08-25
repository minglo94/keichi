"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { CommitteeBadge } from "@/components/teacher/CommitteeBadge"

type CommitteeType = "ADMIN" | "DISCIPLINE" | "IT" | "CURRICULUM" | "ECA"
type TodoStatus    = "OPEN" | "IN_PROGRESS" | "DONE"
type ViewMode      = "all" | "mine" | "assigned"

type Colleague = {
  id:    string
  name:  string | null
  email: string | null
  image: string | null
}

type TodoAssignee = {
  userId: string
  user:   Colleague
}

type Todo = {
  id:          string
  title:       string
  description: string | null
  committee:   CommitteeType | null
  status:      TodoStatus
  dueDate:     string | null
  assignees:   TodoAssignee[]
  createdBy:   { id: string; name: string | null }
  createdById: string
}

const COMMITTEE_FILTER: { label: string; value: CommitteeType | "ALL" }[] = [
  { label: "全部",     value: "ALL"        },
  { label: "行政",     value: "ADMIN"      },
  { label: "訓育",     value: "DISCIPLINE" },
  { label: "資訊科技", value: "IT"         },
  { label: "課程發展", value: "CURRICULUM" },
  { label: "課外活動", value: "ECA"        },
]

const STATUS_FILTER: { label: string; value: TodoStatus | "ALL" }[] = [
  { label: "全部",   value: "ALL"         },
  { label: "待處理", value: "OPEN"        },
  { label: "進行中", value: "IN_PROGRESS" },
  { label: "完成",   value: "DONE"        },
]

const VIEW_TABS: { label: string; value: ViewMode }[] = [
  { label: "全部",     value: "all"      },
  { label: "我建立",   value: "mine"     },
  { label: "分配給我", value: "assigned" },
]

const BORDER: Record<CommitteeType, string> = {
  ADMIN:      "committee-border-admin",
  DISCIPLINE: "committee-border-discipline",
  IT:         "committee-border-it",
  CURRICULUM: "committee-border-curriculum",
  ECA:        "committee-border-eca",
}

const NEXT_STATUS: Record<TodoStatus, TodoStatus> = {
  OPEN:        "IN_PROGRESS",
  IN_PROGRESS: "DONE",
  DONE:        "OPEN",
}

const BTN_LABEL: Record<TodoStatus, string> = {
  OPEN:        "開始",
  IN_PROGRESS: "完成",
  DONE:        "重開",
}

const STATUS_BADGE: Record<TodoStatus, { label: string; bg: string; color: string }> = {
  OPEN:        { label: "待處理", bg: "var(--color-surface-2)",     color: "var(--color-ink-500)"    },
  IN_PROGRESS: { label: "進行中", bg: "var(--color-admin-soft)",    color: "var(--color-admin)"      },
  DONE:        { label: "完成",   bg: "var(--color-curriculum-soft)", color: "var(--color-curriculum)" },
}

function formatDue(d: string | null): string {
  if (!d) return ""
  const date = new Date(d)
  return `${date.getMonth()+1}月${date.getDate()}日`
}

function isOverdue(d: string | null, status: TodoStatus): boolean {
  if (!d || status === "DONE") return false
  return new Date(d) < new Date()
}

function Avatar({ user, size = 20 }: { user: Colleague | null | undefined; size?: number }) {
  if (!user) return null
  const initials = user.name ? user.name.slice(0, 1) : "?"
  if (user.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={user.image} alt={user.name ?? ""} width={size} height={size}
        className="rounded-full object-cover shrink-0"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      className="rounded-full shrink-0 flex items-center justify-center text-white font-medium"
      style={{ width: size, height: size, background: "var(--color-accent)", fontSize: size * 0.5 }}
    >
      {initials}
    </div>
  )
}

// Searchable chip multi-select for assignees
function AssigneeChipSelect({
  selected, onChange, currentUserId,
}: {
  selected: Colleague[]
  onChange: (next: Colleague[]) => void
  currentUserId: string | null
}) {
  const [query,    setQuery]    = useState("")
  const [results,  setResults]  = useState<Colleague[]>([])
  const [open,     setOpen]     = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wrapRef  = useRef<HTMLDivElement>(null)

  const search = useCallback(async (q: string) => {
    const url = q ? `/api/users?q=${encodeURIComponent(q)}` : "/api/users"
    const res  = await fetch(url)
    if (res.ok) {
      const data: Colleague[] = await res.json()
      setResults(data.filter(
        (u) => u.id !== currentUserId && !selected.some((s) => s.id === u.id)
      ))
    }
  }, [currentUserId, selected])

  useEffect(() => {
    if (open) {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => search(query), 300)
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [query, open, search])

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  function add(user: Colleague) {
    onChange([...selected, user])
    setQuery("")
    setOpen(false)
  }

  function remove(id: string) {
    onChange(selected.filter((u) => u.id !== id))
  }

  const inputStyle = {
    border:     "1px solid var(--color-border)",
    background: "var(--color-surface)",
    color:      "var(--color-ink-900)",
  }

  return (
    <div ref={wrapRef} className="relative">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {selected.map((u) => (
            <span
              key={u.id}
              className="flex items-center gap-1 px-2 py-0.5 rounded-pill text-caption"
              style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
            >
              <Avatar user={u} size={14} />
              {u.name ?? u.email}
              <button
                type="button"
                onClick={() => remove(u.id)}
                className="leading-none hover:opacity-60"
              >×</button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => { setOpen(true); search(query) }}
        placeholder={selected.length === 0 ? "搜尋同事姓名…" : "加入更多…"}
        className="w-full px-3 py-2 text-body rounded-input border outline-none text-caption"
        style={inputStyle}
      />

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div
          className="absolute z-20 w-full mt-1 rounded-input shadow-card overflow-hidden"
          style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)" }}
        >
          {results.slice(0, 8).map((u) => (
            <button
              key={u.id}
              type="button"
              onClick={() => add(u)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--color-surface-2)] transition-colors"
            >
              <Avatar user={u} size={20} />
              <span className="text-body" style={{ color: "var(--color-ink-900)" }}>
                {u.name ?? u.email}
              </span>
              {u.email && u.name && (
                <span className="text-caption ml-auto" style={{ color: "var(--color-ink-400)" }}>
                  {u.email}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function TodosPage() {
  const [todos,         setTodos]         = useState<Todo[]>([])
  const [loading,       setLoading]       = useState(true)
  const [committee,     setCommittee]     = useState<CommitteeType | "ALL">("ALL")
  const [status,        setStatus]        = useState<TodoStatus | "ALL">("ALL")
  const [view,          setView]          = useState<ViewMode>("all")
  const [showForm,      setShowForm]      = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // New todo form state
  const [title,        setTitle]        = useState("")
  const [desc,         setDesc]         = useState("")
  const [newCommittee, setNewCommittee] = useState<CommitteeType>("ADMIN")
  const [dueDate,      setDueDate]      = useState("")
  const [assignees,    setAssignees]    = useState<Colleague[]>([])
  const [saving,       setSaving]       = useState(false)

  async function load() {
    setLoading(true)
    const params = new URLSearchParams()
    if (committee !== "ALL") params.set("committee", committee)
    if (status    !== "ALL") params.set("status",    status)
    if (view !== "all")      params.set("view",      view)
    const res = await fetch(`/api/todos?${params}`)
    if (res.ok) setTodos(await res.json())
    setLoading(false)
  }

  useEffect(() => {
    // Get current user id from a "mine" view fetch
    fetch("/api/todos?view=mine").then((r) => r.json()).then((d: Todo[]) => {
      if (d.length > 0) setCurrentUserId(d[0].createdBy.id)
    })
  }, [])

  useEffect(() => { load() }, [committee, status, view]) // eslint-disable-line

  async function advance(todo: Todo) {
    const next = NEXT_STATUS[todo.status]
    setTodos((prev) => prev.map((t) => t.id === todo.id ? { ...t, status: next } : t))
    await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
  }

  async function deleteTodo(id: string) {
    if (!window.confirm("確認刪除此待辦事項？此操作無法撤回。")) return
    setTodos((prev) => prev.filter((t) => t.id !== id))
    await fetch(`/api/todos/${id}`, { method: "DELETE" })
  }

  async function createTodo(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch("/api/todos", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: desc || undefined,
        committee:   newCommittee,
        dueDate:     dueDate ? new Date(dueDate).toISOString() : undefined,
        assigneeIds: assignees.map((a) => a.id),
      }),
    })
    if (res.ok) {
      const created: Todo = await res.json()
      setTodos((prev) => [created, ...prev])
      setTitle(""); setDesc(""); setDueDate(""); setAssignees([]); setShowForm(false)
    }
    setSaving(false)
  }

  const inputCls = "w-full px-3 py-2 text-body rounded-input border outline-none"
  const inputStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-h1">待辦事項</h1>
          <p className="text-body mt-0.5" style={{ color: "var(--color-ink-500)" }}>個人及分組任務管理</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 rounded-input text-body font-medium text-white"
          style={{ background: "var(--color-accent)" }}
        >
          + 新增待辦
        </button>
      </div>

      {/* New todo form */}
      {showForm && (
        <form onSubmit={createTodo} className="card p-5 mb-6 space-y-4">
          <h3 className="text-h3">新增待辦事項</h3>

          <div>
            <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>標題 *</label>
            <input required value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="待辦事項標題" className={inputCls} style={inputStyle} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>委員會</label>
              <select value={newCommittee} onChange={(e) => setNewCommittee(e.target.value as CommitteeType)}
                className={inputCls} style={inputStyle}>
                <option value="ADMIN">行政</option>
                <option value="DISCIPLINE">訓育</option>
                <option value="IT">資訊科技</option>
                <option value="CURRICULUM">課程發展</option>
                <option value="ECA">課外活動</option>
              </select>
            </div>
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>截止日期</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                className={inputCls} style={inputStyle} />
            </div>
          </div>

          {/* Multi-assignee chip select */}
          <div>
            <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>
              分配同事（可多選）
            </label>
            <AssigneeChipSelect
              selected={assignees}
              onChange={setAssignees}
              currentUserId={currentUserId}
            />
          </div>

          <div>
            <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>備注</label>
            <textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)}
              placeholder="（選填）" className={`${inputCls} resize-none`} style={inputStyle} />
          </div>

          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setShowForm(false)}
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
        </form>
      )}

      {/* View tabs */}
      <div className="flex gap-1 mb-4 p-1 rounded-input w-fit" style={{ background: "var(--color-surface-2)" }}>
        {VIEW_TABS.map(({ label, value }) => (
          <button key={value} onClick={() => setView(value)}
            className="px-3 py-1.5 rounded text-caption font-medium transition-colors"
            style={{
              background: view === value ? "var(--color-surface)" : "transparent",
              color:      view === value ? "var(--color-ink-900)" : "var(--color-ink-500)",
              boxShadow:  view === value ? "0 1px 3px oklch(0% 0 0 / 8%)" : "none",
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="space-y-3 mb-4">
        <div className="flex gap-2 flex-wrap">
          {COMMITTEE_FILTER.map(({ label, value }) => (
            <button key={value} onClick={() => setCommittee(value)}
              className="px-3 py-1.5 rounded-pill text-caption font-medium transition-colors"
              style={{
                background: committee === value ? "var(--color-accent)" : "var(--color-surface)",
                color:      committee === value ? "white"               : "var(--color-ink-700)",
                border:     "1px solid var(--color-border)",
              }}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTER.map(({ label, value }) => (
            <button key={value} onClick={() => setStatus(value)}
              className="px-3 py-1.5 rounded-pill text-caption font-medium transition-colors"
              style={{
                background: status === value ? "var(--color-ink-900)" : "var(--color-surface)",
                color:      status === value ? "white"                : "var(--color-ink-700)",
                border:     "1px solid var(--color-border)",
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Todo list */}
      {loading ? (
        <div className="text-center py-12 text-body" style={{ color: "var(--color-ink-300)" }}>載入中…</div>
      ) : todos.length === 0 ? (
        <div className="text-center py-12 text-body" style={{ color: "var(--color-ink-300)" }}>暫無待辦事項</div>
      ) : (
        <ul className="space-y-2">
          {todos.map((todo) => {
            const overdue    = isOverdue(todo.dueDate, todo.status)
            const isAssigned = currentUserId ? todo.createdById !== currentUserId : false
            const shownAssignees = todo.assignees.slice(0, 3)
            const overflow       = todo.assignees.length - 3

            return (
              <li
                key={todo.id}
                className={`card ${todo.committee ? BORDER[todo.committee] : "committee-border-none"} pl-4 pr-4 py-3 flex items-start gap-3`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>
                      {todo.title}
                    </span>
                    <CommitteeBadge committee={todo.committee} />
                    <span
                      className="text-caption px-1.5 py-0.5 rounded-pill shrink-0"
                      style={{ background: STATUS_BADGE[todo.status].bg, color: STATUS_BADGE[todo.status].color }}
                    >
                      {STATUS_BADGE[todo.status].label}
                    </span>
                    {isAssigned && todo.createdBy.name && (
                      <span
                        className="text-caption px-1.5 py-0.5 rounded-pill"
                        style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
                      >
                        由 {todo.createdBy.name} 分配
                      </span>
                    )}
                  </div>

                  {todo.description && (
                    <p className="text-caption mt-0.5 truncate" style={{ color: "var(--color-ink-500)" }}>
                      {todo.description}
                    </p>
                  )}

                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {todo.dueDate && (
                      <p className="text-caption"
                        style={{ color: overdue ? "var(--color-discipline)" : "var(--color-ink-500)" }}>
                        {overdue ? "⚠ 逾期 · " : ""}{formatDue(todo.dueDate)}
                      </p>
                    )}
                    {/* Assignee chips (max 3 + overflow) */}
                    {todo.assignees.length > 0 && (
                      <div className="flex items-center gap-1">
                        {shownAssignees.map((a) => (
                          <Avatar key={a.userId} user={a.user} size={18} />
                        ))}
                        {overflow > 0 && (
                          <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>
                            +{overflow}
                          </span>
                        )}
                        <span className="text-caption" style={{ color: "var(--color-ink-500)" }}>
                          {shownAssignees.map((a) => a.user.name ?? a.user.email).slice(0, 2).join("、")}
                          {todo.assignees.length > 2 ? "…" : ""}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => advance(todo)}
                    className="text-caption font-medium px-2.5 py-1 rounded-input border transition-colors"
                    style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)", background: "var(--color-surface-2)" }}>
                    {BTN_LABEL[todo.status]}
                  </button>
                  {!isAssigned && (
                    <button onClick={() => deleteTodo(todo.id)}
                      className="text-caption px-2 py-1 rounded-input transition-colors"
                      style={{ color: "var(--color-ink-300)" }}
                      title="刪除">
                      ×
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
