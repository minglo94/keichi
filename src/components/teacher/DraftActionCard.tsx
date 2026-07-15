"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { BEHAVIOR_LABEL, BEHAVIOR_ORDER, type BehaviorTypeValue } from "@/lib/behavior-types"

// The draft shape forwarded from the chat route (kind + loosely-typed data).
export type Draft = { kind: string; data: Record<string, unknown> }

const COMMITTEES = ["ADMIN", "DISCIPLINE", "IT", "CURRICULUM", "ECA"] as const
const COMMITTEE_LABEL: Record<string, string> = {
  ADMIN: "行政", DISCIPLINE: "訓育", IT: "資訊科技", CURRICULUM: "課程", ECA: "課外活動",
}
const TARGETS = ["ALL", "ADMIN", "DISCIPLINE", "IT", "CURRICULUM", "ECA"] as const

const KIND_META: Record<string, { title: string; endpoint: string; link: string; linkLabel: string }> = {
  todo:           { title: "新增待辦事項", endpoint: "/api/todos",             link: "/teacher/todos",                          linkLabel: "查看待辦" },
  announcement:   { title: "發佈公告",     endpoint: "/api/announcements",     link: "/teacher/announcements",                  linkLabel: "查看公告" },
  calendar:       { title: "新增行事曆項目", endpoint: "/api/calendar-events", link: "/teacher/calendar",                       linkLabel: "查看行事曆" },
  activity:       { title: "新增活動",     endpoint: "/api/activities",        link: "/teacher/activities",                     linkLabel: "查看活動" },
  flashcard_deck: { title: "新增閃卡牌組", endpoint: "/api/flashcard-decks",   link: "/teacher/flashcards",                     linkLabel: "查看牌組" },
  behavior:       { title: "新增行為紀錄", endpoint: "/api/behavior-records",  link: "/teacher/committee/discipline/behavior",  linkLabel: "查看紀錄" },
}

type Teacher = { id: string; name: string | null; email: string | null; role?: string }

function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback
}

// Normalize a draft date into a value a <input type="datetime-local"> accepts
// (YYYY-MM-DDTHH:mm). Andy may emit date-only (YYYY-MM-DD) or a full ISO —
// a bare date silently blanks the input, so give it a default time.
function toDateTimeLocal(v: unknown): string {
  const s = str(v).trim()
  if (!s) return ""
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s}T09:00`
  const d = new Date(s)
  if (!isNaN(d.getTime())) {
    const p = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
  }
  return s.slice(0, 16)
}

// Normalize a draft date into a value a <input type="date"> accepts (YYYY-MM-DD).
function toDateInput(v: unknown): string {
  const s = str(v).trim()
  if (!s) return ""
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  if (!isNaN(d.getTime())) {
    const p = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  }
  return ""
}

// Strip honorifics so "陳大文老師" / "Chan sir" resolve to a real user name.
function coreName(s: string): string {
  return s.trim().replace(/\s+/g, "")
    .replace(/(老師|先生|小姐|女士|同事|主任|sir|miss|mrs|mr|ms)\.?$/i, "")
}

const inputCls = "w-full px-2.5 py-1.5 text-caption rounded-input border outline-none"
const inputStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }

export function DraftActionCard({ draft }: { draft: Draft }) {
  const meta = KIND_META[draft.kind]
  const d = draft.data

  // Common editable fields (pre-filled from the draft).
  const [title,       setTitle]       = useState(str(d.title))
  const [description, setDescription] = useState(str(d.description) || str(d.body))
  const [committee,   setCommittee]   = useState(str(d.committee))
  const [target,      setTarget]      = useState(str(d.target, "ALL"))
  const [dueDate,     setDueDate]     = useState(toDateInput(d.dueDate))
  const [startAt,     setStartAt]     = useState(toDateTimeLocal(d.startDate ?? d.startTime))
  const [endAt,       setEndAt]       = useState(toDateTimeLocal(d.endDate))
  const [location,    setLocation]    = useState(str(d.location))
  const [isPublic,    setIsPublic]    = useState(Boolean(d.isPublic))

  // Behavior fields
  const [className,   setClassName]   = useState(str(d.className))
  const [studentName, setStudentName] = useState(str(d.studentName))
  const [bType,       setBType]       = useState<BehaviorTypeValue>((str(d.type) || "DEMERIT") as BehaviorTypeValue)
  const [bDate,       setBDate]       = useState(str(d.date).slice(0, 10) || new Date().toISOString().slice(0, 10))
  const [action,      setAction]      = useState(str(d.action))

  // Todo assignee resolution
  const [assigneeName]  = useState(str(d.assigneeName))
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [assigneeId, setAssigneeId] = useState("")

  const [state, setState] = useState<"idle" | "saving" | "done" | "error" | "cancelled">("idle")
  const [errMsg, setErrMsg] = useState("")

  useEffect(() => {
    if (draft.kind === "todo" && assigneeName) {
      fetch("/api/admin/users")
        .then((r) => r.ok ? r.json() : [])
        .then((users: Teacher[]) => {
          const staff = users.filter((u) => u.role === "TEACHER" || u.role === "ADMIN")
          setTeachers(staff)
          const want = coreName(assigneeName)
          const wantLc = assigneeName.trim().toLowerCase()
          const match = staff.find((u) => {
            const n = coreName(u.name ?? "")
            const email = (u.email ?? "").toLowerCase()
            if (!want || !n) return email !== "" && email === wantLc
            return n === want || n.includes(want) || want.includes(n) || email === wantLc
          })
          if (match) setAssigneeId(match.id)
        })
        .catch(() => {})
    }
  }, [draft.kind, assigneeName])

  if (!meta) return null

  function buildBody(): Record<string, unknown> | { error: string } {
    switch (draft.kind) {
      case "todo":
        if (!title.trim()) return { error: "請輸入標題" }
        return {
          title, description: description || undefined,
          committee: committee || undefined,
          dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
          assigneeIds: assigneeId ? [assigneeId] : [],
        }
      case "announcement":
        if (!title.trim() || !description.trim()) return { error: "請輸入標題及內容" }
        return { title, body: description, target: target || "ALL" }
      case "calendar":
        if (!title.trim() || !startAt) return { error: "請輸入標題及開始時間" }
        return {
          title, startDate: new Date(startAt).toISOString(),
          endDate: endAt ? new Date(endAt).toISOString() : undefined,
          committee: committee || undefined,
        }
      case "activity":
        if (!title.trim() || !startAt) return { error: "請輸入標題及開始時間" }
        return {
          title, startTime: new Date(startAt).toISOString(),
          location: location || undefined, committee: committee || undefined,
        }
      case "flashcard_deck":
        if (!title.trim()) return { error: "請輸入牌組名稱" }
        return { title, isPublic }
      case "behavior":
        if (!className.trim() || !studentName.trim() || !description.trim()) return { error: "請輸入班別、學生及描述" }
        return {
          date: new Date(bDate).toISOString(), className, studentName,
          type: bType, description, action: action || undefined,
        }
      default:
        return { error: "未知類型" }
    }
  }

  async function confirm() {
    const body = buildBody()
    if ("error" in body) { setErrMsg(body.error as string); setState("error"); return }
    setState("saving"); setErrMsg("")
    try {
      const res = await fetch(meta.endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setErrMsg(data?.error ?? `錯誤 ${res.status}`); setState("error"); return
      }
      setState("done")
    } catch {
      setErrMsg("網絡錯誤"); setState("error")
    }
  }

  if (state === "cancelled") {
    return (
      <div className="mt-2 rounded-input px-3 py-2" style={{ background: "var(--color-surface-2)" }}>
        <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>已取消，未有新增。</span>
      </div>
    )
  }

  if (state === "done") {
    return (
      <div className="mt-2 rounded-input p-3 flex items-center gap-2" style={{ background: "var(--color-curriculum)15" }}>
        <span className="text-caption font-medium" style={{ color: "var(--color-curriculum)" }}>✓ 已新增</span>
        <Link href={meta.link} className="text-caption font-medium" style={{ color: "var(--color-accent)" }}>{meta.linkLabel} →</Link>
      </div>
    )
  }

  return (
    <div className="mt-2 rounded-input p-3 space-y-2" style={{ background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
      <p className="text-caption font-semibold" style={{ color: "var(--color-accent)" }}>{meta.title}</p>

      {/* Title (all except behavior) */}
      {draft.kind !== "behavior" && (
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder={draft.kind === "flashcard_deck" ? "牌組名稱" : "標題"} className={inputCls} style={inputStyle} />
      )}

      {/* Body / description */}
      {(draft.kind === "todo" || draft.kind === "announcement" || draft.kind === "behavior") && (
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
          placeholder={draft.kind === "announcement" ? "公告內容" : draft.kind === "behavior" ? "事件描述" : "說明（選填）"}
          className={`${inputCls} resize-none`} style={inputStyle} />
      )}

      {/* Todo: due date + committee + assignee */}
      {draft.kind === "todo" && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} style={inputStyle} title="截止日期" />
            <select value={committee} onChange={(e) => setCommittee(e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">不指定委員會</option>
              {COMMITTEES.map((c) => <option key={c} value={c}>{COMMITTEE_LABEL[c]}</option>)}
            </select>
          </div>
          {assigneeName && (
            <div>
              <label className="text-[11px]" style={{ color: "var(--color-ink-400)" }}>指派畀（「{assigneeName}」）</label>
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inputCls} style={inputStyle}>
                <option value="">不指派</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.name ?? t.email}{t.email ? `（${t.email}）` : ""}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Announcement target */}
      {draft.kind === "announcement" && (
        <select value={target} onChange={(e) => setTarget(e.target.value)} className={inputCls} style={inputStyle}>
          {TARGETS.map((t) => <option key={t} value={t}>{t === "ALL" ? "全校" : COMMITTEE_LABEL[t]}</option>)}
        </select>
      )}

      {/* Calendar / activity: start (+ end / location) + committee */}
      {(draft.kind === "calendar" || draft.kind === "activity") && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={inputCls} style={inputStyle} />
            {draft.kind === "calendar"
              ? <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)} className={inputCls} style={inputStyle} />
              : <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="地點（選填）" className={inputCls} style={inputStyle} />}
          </div>
          <select value={committee} onChange={(e) => setCommittee(e.target.value)} className={inputCls} style={inputStyle}>
            <option value="">不指定委員會</option>
            {COMMITTEES.map((c) => <option key={c} value={c}>{COMMITTEE_LABEL[c]}</option>)}
          </select>
        </div>
      )}

      {/* Flashcard deck: public toggle */}
      {draft.kind === "flashcard_deck" && (
        <label className="flex items-center gap-2 text-caption cursor-pointer" style={{ color: "var(--color-ink-600)" }}>
          <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} /> 公開牌組
        </label>
      )}

      {/* Behavior: class/student/type/date/action */}
      {draft.kind === "behavior" && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input value={className} onChange={(e) => setClassName(e.target.value)} placeholder="班別" className={inputCls} style={inputStyle} />
            <input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="學生姓名" className={inputCls} style={inputStyle} />
          </div>
          <div className="flex gap-2">
            <select value={bType} onChange={(e) => setBType(e.target.value as BehaviorTypeValue)} className={inputCls} style={inputStyle}>
              {BEHAVIOR_ORDER.map((t) => <option key={t} value={t}>{BEHAVIOR_LABEL[t]}</option>)}
            </select>
            <input type="date" value={bDate} onChange={(e) => setBDate(e.target.value)} className={inputCls} style={inputStyle} />
          </div>
          <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="跟進行動（選填）" className={inputCls} style={inputStyle} />
        </div>
      )}

      {state === "error" && <p className="text-caption" style={{ color: "var(--color-discipline)" }}>{errMsg}</p>}

      <div className="flex gap-2 pt-1">
        <button onClick={confirm} disabled={state === "saving"}
          className="text-caption px-3 py-1.5 rounded-input font-medium text-white"
          style={{ background: "var(--color-accent)", opacity: state === "saving" ? 0.6 : 1 }}>
          {state === "saving" ? "儲存中…" : "確認新增"}
        </button>
        <button onClick={() => setState("cancelled")} className="text-caption px-3 py-1.5 rounded-input border"
          style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-500)" }}>
          取消
        </button>
      </div>
    </div>
  )
}
