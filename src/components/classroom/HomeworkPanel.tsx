"use client"

import { useEffect, useState } from "react"
import type { RosterEntry } from "@/components/classroom/RosterPanel"
import type { useLessonRecords } from "@/components/classroom/useLessonRecords"
import { RECORD_COLOR } from "@/lib/lesson-records"
import { CollectSheet } from "@/components/classroom/CollectSheet"

// 功課: what was set, by whom, and who missed it. Homework recorded by a
// 課代表 is marked as such, and a teacher can tick 已覆核 once it has been
// checked in class — a marker for the class, not an approval gate.

export type HomeworkItem = {
  id: string; title: string; detail: string | null; subject: string | null
  assignedOn: string; dueDate: string | null; byRole: "TEACHER" | "REP"
  confirmedAt: string | null; recorder: { id: string; name: string | null }
  missing: number; absent: number
}
type Rep = { id: string; subject: string; student: { id: string; name: string | null } }
type Lesson = ReturnType<typeof useLessonRecords>

const ymd = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 10) : "")
const todayHk = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)

export function HomeworkPanel({
  classId, roster, homework, onChanged, lesson, sessionId, defaultSubject,
}: {
  classId: string
  roster: RosterEntry[]
  homework: HomeworkItem[]
  onChanged: () => void
  lesson: Lesson
  sessionId: string | null
  defaultSubject: string | null
}) {
  const [title,   setTitle]   = useState("")
  const [subject, setSubject] = useState(defaultSubject ?? "")
  const [detail,  setDetail]  = useState("")
  const [due,     setDue]     = useState("")
  const [busy,    setBusy]    = useState(false)
  const [msg,     setMsg]     = useState<{ ok: boolean; text: string } | null>(null)
  const [collect, setCollect] = useState<string | null>(null)

  useEffect(() => { if (defaultSubject && !subject) setSubject(defaultSubject) }, [defaultSubject, subject])

  const inputCls = "px-3 py-2 text-body rounded-input border outline-none"
  const inputStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }

  async function add() {
    if (!title.trim()) return
    setBusy(true); setMsg(null)
    const res = await fetch(`/api/classes/${classId}/homework`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(), subject: subject.trim() || undefined, detail: detail.trim() || undefined,
        dueDate: due || null, sessionId: sessionId ?? undefined,
      }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg({ ok: false, text: d?.error ?? `儲存失敗 (${res.status})` }); return }
    setTitle(""); setDetail(""); setDue("")
    setMsg({ ok: true, text: "已記錄功課" })
    onChanged()
  }

  async function patch(id: string, body: object) {
    const res = await fetch(`/api/classes/${classId}/homework/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg({ ok: false, text: d?.error ?? "更新失敗" }) }
    onChanged()
  }

  async function remove(h: HomeworkItem) {
    const n = h.missing + h.absent
    const extra = n ? `\n（已記錄的 ${n} 個欠交／缺席未交會保留，但不再連結到這份功課）` : ""
    if (!confirm(`刪除功課「${h.title}」？${extra}`)) return
    const res = await fetch(`/api/classes/${classId}/homework/${h.id}`, { method: "DELETE" })
    if (!res.ok) { const d = await res.json().catch(() => ({})); setMsg({ ok: false, text: d?.error ?? "刪除失敗" }) }
    onChanged()
  }

  const open = homework.filter((h) => !h.dueDate || ymd(h.dueDate) >= todayHk())
  const past = homework.filter((h) => h.dueDate && ymd(h.dueDate) < todayHk())

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-2">
        <h3 className="text-h3">記錄功課</h3>
        <div className="flex gap-2 flex-wrap">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="科目" maxLength={30} className={`${inputCls} w-24`} style={inputStyle} />
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="功課（例如：工作紙 P.12-13）" maxLength={120}
            onKeyDown={(e) => e.key === "Enter" && add()} className={`${inputCls} flex-1 min-w-[200px]`} style={inputStyle} />
          <label className="flex items-center gap-1 text-caption" style={{ color: "var(--color-ink-500)" }}>
            限期 <input type="date" value={due} min={todayHk()} onChange={(e) => setDue(e.target.value)} className={inputCls} style={inputStyle} />
          </label>
        </div>
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="補充（選填）" rows={2} maxLength={2000}
          className={`${inputCls} w-full resize-none`} style={inputStyle} />
        <div className="flex items-center gap-3">
          <button onClick={add} disabled={busy || !title.trim()} className="px-4 py-2 rounded-input text-body font-medium text-white"
            style={{ background: "var(--color-accent)", opacity: busy || !title.trim() ? 0.6 : 1 }}>
            {busy ? "儲存中…" : "記錄"}
          </button>
          {msg && <span className="text-caption" style={{ color: msg.ok ? "var(--color-curriculum)" : "var(--color-discipline)" }}>{msg.ok ? "✓" : "⚠"} {msg.text}</span>}
        </div>
      </div>

      <HomeworkList title="進行中" items={open} roster={roster} onConfirm={(h) => patch(h.id, { confirmed: !h.confirmedAt })}
        onRemove={remove} onMiss={(h) => setCollect(h.id)} />
      {past.length > 0 && (
        <details>
          <summary className="text-caption cursor-pointer" style={{ color: "var(--color-ink-500)" }}>已過限期（{past.length}）</summary>
          <div className="mt-2">
            <HomeworkList title="" items={past} roster={roster} onConfirm={(h) => patch(h.id, { confirmed: !h.confirmedAt })}
              onRemove={remove} onMiss={(h) => setCollect(h.id)} />
          </div>
        </details>
      )}

      {/* The same sheet the 課代表 uses, so the teacher sees every miss for this
          homework — from any lesson, recorded by anyone. */}
      {collect && (
        <CollectSheet classId={classId} homeworkId={collect} teacher sessionId={sessionId}
          onClose={() => setCollect(null)} onChanged={() => { onChanged(); lesson.refresh() }} />
      )}

      <RepManager classId={classId} roster={roster} />
    </div>
  )
}

function HomeworkList({ title, items, onConfirm, onRemove, onMiss }: {
  title: string; items: HomeworkItem[]; roster: RosterEntry[]
  onConfirm: (h: HomeworkItem) => void; onRemove: (h: HomeworkItem) => void; onMiss: (h: HomeworkItem) => void
}) {
  return (
    <div className="card overflow-hidden">
      {title && <div className="px-4 py-2 text-body font-medium" style={{ borderBottom: "1px solid var(--color-border)" }}>{title}（{items.length}）</div>}
      {items.length === 0 ? (
        <p className="p-5 text-center text-caption" style={{ color: "var(--color-ink-300)" }}>未有功課</p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
          {items.map((h) => (
            <li key={h.id} className="px-4 py-2.5 flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <p className="text-body" style={{ color: "var(--color-ink-900)" }}>
                  {h.subject && <span className="text-caption mr-1.5 px-1.5 py-0.5 rounded-pill" style={{ background: "var(--color-surface-2)" }}>{h.subject}</span>}
                  {h.title}
                </p>
                {h.detail && <p className="text-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>{h.detail}</p>}
                <p className="text-caption mt-0.5" style={{ color: "var(--color-ink-400)" }}>
                  {ymd(h.assignedOn)} 派發{h.dueDate ? ` · ${ymd(h.dueDate)} 限期` : ""} · {h.byRole === "REP" ? `課代表 ${h.recorder.name ?? ""}` : h.recorder.name ?? ""}
                  {h.missing > 0 && <span style={{ color: RECORD_COLOR.MISSING_HOMEWORK }}> · {h.missing} 人欠交</span>}
                  {h.absent > 0 && <span style={{ color: RECORD_COLOR.HOMEWORK_ABSENT }}> · {h.absent} 人缺席未交</span>}
                </p>
              </div>
              <div className="flex gap-1.5 items-center">
                <button onClick={() => onMiss(h)} className="text-caption px-2.5 py-1 rounded-input border" style={{ border: "1px solid var(--color-border)", color: RECORD_COLOR.MISSING_HOMEWORK }}>收功課</button>
                <button onClick={() => onConfirm(h)} className="text-caption px-2.5 py-1 rounded-input border"
                  style={{ border: "1px solid var(--color-border)", color: h.confirmedAt ? "var(--color-curriculum)" : "var(--color-ink-500)" }}>
                  {h.confirmedAt ? "✓ 已覆核" : "覆核"}
                </button>
                <button onClick={() => onRemove(h)} className="text-caption px-2" style={{ color: "var(--color-discipline)" }}>✕</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function RepManager({ classId, roster }: { classId: string; roster: RosterEntry[] }) {
  const [reps, setReps] = useState<Rep[]>([])
  const [studentId, setStudentId] = useState("")
  const [subject, setSubject] = useState("")
  const [err, setErr] = useState<string | null>(null)

  async function load() {
    const res = await fetch(`/api/classes/${classId}/reps`)
    if (res.ok) setReps((await res.json()).reps)
  }
  useEffect(() => { load() }, [classId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function add() {
    if (!studentId) return
    setErr(null)
    const res = await fetch(`/api/classes/${classId}/reps`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, subject: subject.trim() }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); setErr(d?.error ?? "新增失敗"); return }
    setStudentId(""); setSubject("")
    load()
  }

  async function remove(id: string) {
    await fetch(`/api/classes/${classId}/reps?id=${id}`, { method: "DELETE" })
    load()
  }

  return (
    <div className="card p-4 space-y-2">
      <h3 className="text-h3">課代表／科代表</h3>
      <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>
        課代表可以喺學生端記錄功課，老師會收到通知。科目留空＝全科課代表；填了科目（例如 中文）就只可以記錄該科。
      </p>
      <div className="flex flex-wrap gap-1.5">
        {reps.length === 0 && <span className="text-caption" style={{ color: "var(--color-ink-300)" }}>未有課代表</span>}
        {reps.map((r) => (
          <span key={r.id} className="text-caption px-2.5 py-1 rounded-pill flex items-center gap-1" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
            {r.student.name}（{r.subject || "全科"}）
            <button onClick={() => remove(r.id)} style={{ color: "var(--color-discipline)" }}>✕</button>
          </span>
        ))}
      </div>
      <div className="flex gap-2 flex-wrap">
        <select value={studentId} onChange={(e) => setStudentId(e.target.value)}
          className="px-3 py-2 text-body rounded-input border outline-none" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }}>
          <option value="">揀選學生…</option>
          {roster.map((s) => <option key={s.id} value={s.id}>{s.tag} {s.name}</option>)}
        </select>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="科目（留空＝全科）" maxLength={30}
          className="px-3 py-2 text-body rounded-input border outline-none w-40" style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }} />
        <button onClick={add} disabled={!studentId} className="px-4 py-2 rounded-input text-body text-white"
          style={{ background: "var(--color-accent)", opacity: studentId ? 1 : 0.5 }}>新增</button>
      </div>
      {err && <p className="text-caption" style={{ color: "var(--color-discipline)" }}>⚠ {err}</p>}
    </div>
  )
}
