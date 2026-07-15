"use client"

import Link from "next/link"
import { useState } from "react"
import { CommitteeBadge } from "./CommitteeBadge"

type CommitteeType = "ADMIN" | "DISCIPLINE" | "IT" | "CURRICULUM" | "ECA"
type TodoStatus    = "OPEN" | "IN_PROGRESS" | "DONE"

type Todo = {
  id:          string
  title:       string
  committee:   CommitteeType
  status:      TodoStatus
  dueDate:     string | null
  description: string | null
}

const BORDER_CLASS: Record<CommitteeType, string> = {
  ADMIN:      "committee-border-admin",
  DISCIPLINE: "committee-border-discipline",
  IT:         "committee-border-it",
  CURRICULUM: "committee-border-curriculum",
  ECA:        "committee-border-eca",
}

const STATUS_LABELS: Record<TodoStatus, string> = {
  OPEN:        "待處理",
  IN_PROGRESS: "進行中",
  DONE:        "完成",
}

const STATUS_ACTIONS: Record<TodoStatus, string> = {
  OPEN:        "開始",
  IN_PROGRESS: "完成",
  DONE:        "重開",
}

const NEXT_STATUS: Record<TodoStatus, TodoStatus> = {
  OPEN:        "IN_PROGRESS",
  IN_PROGRESS: "DONE",
  DONE:        "OPEN",
}

function formatDue(dateStr: string | null): string {
  if (!dateStr) return ""
  const d = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (diff < 0)  return `逾期 ${Math.abs(diff)} 天`
  if (diff === 0) return "今天到期"
  if (diff === 1) return "明天到期"
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function isOverdue(dateStr: string | null, status: TodoStatus): boolean {
  if (!dateStr || status === "DONE") return false
  return new Date(dateStr) < new Date()
}

export function TodoPreview({ initialTodos }: { initialTodos: Todo[] }) {
  const [todos, setTodos] = useState(initialTodos)

  async function advanceStatus(todo: Todo) {
    const next = NEXT_STATUS[todo.status]
    // Optimistic update
    setTodos((prev) => prev.map((t) => t.id === todo.id ? { ...t, status: next } : t))
    await fetch(`/api/todos/${todo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: next }),
    })
  }

  const visible = todos.filter((t) => t.status !== "DONE").slice(0, 5)
  const doneCount = todos.filter((t) => t.status === "DONE").length

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-h2">待辦事項 · To-Do</h2>
        <Link
          href="/teacher/todos"
          className="text-caption font-medium"
          style={{ color: "var(--color-accent)" }}
        >
          查看全部 →
        </Link>
      </div>

      {visible.length === 0 ? (
        <p className="text-body py-6 text-center" style={{ color: "var(--color-ink-300)" }}>
          暫無待辦事項
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((todo) => {
            const overdue = isOverdue(todo.dueDate, todo.status)
            return (
              <li
                key={todo.id}
                className={`${BORDER_CLASS[todo.committee]} pl-4 pr-3 py-3 rounded-r-card flex items-start gap-3`}
                style={{
                  background: "var(--color-surface-2)",
                  borderRadius: "0 8px 8px 0",
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>
                      {todo.title}
                    </span>
                    <CommitteeBadge committee={todo.committee} />
                  </div>
                  {todo.dueDate && (
                    <p
                      className="text-caption mt-0.5"
                      style={{ color: overdue ? "var(--color-discipline)" : "var(--color-ink-500)" }}
                    >
                      {formatDue(todo.dueDate)}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => advanceStatus(todo)}
                  className="shrink-0 text-caption font-medium px-2.5 py-1 rounded-input transition-colors"
                  style={{
                    background: "var(--color-surface)",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-ink-700)",
                  }}
                >
                  {STATUS_ACTIONS[todo.status]}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {doneCount > 0 && (
        <p className="mt-3 text-caption text-center" style={{ color: "var(--color-ink-300)" }}>
          已完成 {doneCount} 項
        </p>
      )}
    </div>
  )
}
