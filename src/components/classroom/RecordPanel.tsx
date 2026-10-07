"use client"

import { useMemo, useState } from "react"
import type { RosterEntry } from "@/components/classroom/RosterPanel"
import type { LessonRecordRow, useLessonRecords } from "@/components/classroom/useLessonRecords"
import { BOOK_TAGS, PERFORMANCE_TAGS, RECORD_COLOR, RECORD_LABEL, RECORD_SHORT } from "@/lib/lesson-records"

// 紀錄: choose what to record once, then tap students. No form per student —
// this is used standing up, mid-lesson, often one-handed.
//
// 課堂表現 accumulates as 待發放 and is paid out by 發放積點, which can be
// 撤回 cleanly. Nothing reaches a student's 積點 until the teacher decides.

type Lesson = ReturnType<typeof useLessonRecords>
type Action =
  | { kind: "PERFORMANCE"; tag: string; points: number }
  | { kind: "MISSING_BOOK"; tag: string }
  | { kind: "MISSING_HOMEWORK"; homeworkId: string; title: string }

type Homework = { id: string; title: string; subject: string | null; dueDate: string | null }

export function RecordPanel({
  roster, lesson, homework, sessionId,
}: {
  roster: RosterEntry[]
  lesson: Lesson
  homework: Homework[]
  sessionId: string | null
}) {
  const [action, setAction] = useState<Action | null>(null)
  const [custom, setCustom] = useState("")
  const [msg,    setMsg]    = useState<{ ok: boolean; text: string } | null>(null)
  const [busy,   setBusy]   = useState(false)
  const [awarding, setAwarding] = useState(false)
  const [open,   setOpen]   = useState<string | null>(null) // student whose records are expanded

  const records = lesson.records
  const byStudent = useMemo(() => {
    const m = new Map<string, LessonRecordRow[]>()
    for (const r of records) m.set(r.studentId, [...(m.get(r.studentId) ?? []), r])
    return m
  }, [records])

  const pending = lesson.records.filter((r) => r.kind === "PERFORMANCE" && !r.awardedAt)
  const awarded = lesson.records.filter((r) => r.kind === "PERFORMANCE" && r.awardedAt)
  const nameOf = (id: string) => roster.find((s) => s.id === id)?.name ?? "—"
  const netBy = (rows: typeof pending) => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(r.studentId, (m.get(r.studentId) ?? 0) + r.points)
    return Array.from(m.entries()).filter(([, n]) => n !== 0)
  }

  async function tap(studentId: string) {
    if (!action || busy) {
      if (!action) setOpen(open === studentId ? null : studentId)
      return
    }
    setBusy(true)
    const r = await lesson.record(
      action.kind === "PERFORMANCE" ? { kind: "PERFORMANCE", studentIds: [studentId], tag: action.tag, points: action.points }
      : action.kind === "MISSING_BOOK" ? { kind: "MISSING_BOOK", studentIds: [studentId], tag: action.tag }
      : { kind: "MISSING_HOMEWORK", studentIds: [studentId], homeworkId: action.homeworkId },
    )
    setMsg({ ok: r.ok, text: r.ok ? `${nameOf(studentId)}：${actionLabel(action)}` : r.message })
    setBusy(false)
  }

  async function award() {
    if (!sessionId) return
    const net = netBy(pending)
    if (!confirm(`發放本堂課堂表現積點？\n\n${net.map(([id, n]) => `${nameOf(id)} ${n > 0 ? "+" : ""}${n}`).join("\n") || "（全部抵銷，冇積點要發）"}`)) return
    setAwarding(true); setMsg(null)
    const res = await fetch(`/api/classroom/sessions/${sessionId}/award`, { method: "POST" })
    const d = await res.json().catch(() => ({}))
    setAwarding(false)
    if (!res.ok) { setMsg({ ok: false, text: d?.error ?? `發放失敗 (${res.status})` }); return }
    const skipped = (d.skipped ?? []) as { name: string | null; reason: string }[]
    setMsg({
      ok: skipped.length === 0,
      text: `已發放給 ${d.awarded.length} 位學生` +
        (skipped.length ? `；${skipped.map((s) => `${s.name ?? ""}（${s.reason}）`).join("、")}` : ""),
    })
    await lesson.refresh()
  }

  async function withdraw() {
    if (!sessionId || !confirm("撤回本堂已發放的積點？學生的積點記錄會一併移除，紀錄會變回「待發放」。")) return
    setAwarding(true); setMsg(null)
    const res = await fetch(`/api/classroom/sessions/${sessionId}/award`, { method: "DELETE" })
    const d = await res.json().catch(() => ({}))
    setAwarding(false)
    setMsg(res.ok ? { ok: true, text: `已撤回 ${d.transactions} 筆積點` } : { ok: false, text: d?.error ?? "撤回失敗" })
    await lesson.refresh()
  }

  const chip = (selected: boolean, color: string) => ({
    background: selected ? color : "var(--color-surface)",
    color: selected ? "#fff" : "var(--color-ink-700)",
    border: `1px solid ${selected ? color : "var(--color-border)"}`,
  })
  const is = (a: Action) => !!action && actionKey(action) === actionKey(a)

  return (
    <div className="space-y-4">
      {/* 1. choose the action */}
      <div className="card p-3 space-y-2">
        <Row label="課堂表現" color={RECORD_COLOR.PERFORMANCE}>
          {PERFORMANCE_TAGS.map((t) => {
            const a: Action = { kind: "PERFORMANCE", tag: t.tag, points: t.points }
            return (
              <button key={t.tag} onClick={() => setAction(is(a) ? null : a)} className="text-caption px-2.5 py-1.5 rounded-pill"
                style={chip(is(a), t.points > 0 ? RECORD_COLOR.PERFORMANCE : RECORD_COLOR.ABSENT)}>
                {t.tag} {t.points > 0 ? "+" : ""}{t.points}
              </button>
            )
          })}
        </Row>
        <Row label="欠帶書本" color={RECORD_COLOR.MISSING_BOOK}>
          {BOOK_TAGS.map((tag) => {
            const a: Action = { kind: "MISSING_BOOK", tag }
            return (
              <button key={tag} onClick={() => setAction(is(a) ? null : a)} className="text-caption px-2.5 py-1.5 rounded-pill"
                style={chip(is(a), RECORD_COLOR.MISSING_BOOK)}>{tag}</button>
            )
          })}
          <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="其他…" maxLength={30}
            onKeyDown={(e) => { if (e.key === "Enter" && custom.trim()) setAction({ kind: "MISSING_BOOK", tag: custom.trim() }) }}
            className="text-caption px-2 py-1 rounded-pill border outline-none w-24"
            style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)" }} />
        </Row>
        <Row label="欠交功課" color={RECORD_COLOR.MISSING_HOMEWORK}>
          {homework.length === 0
            ? <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>先在「功課」記錄功課，才可以記欠交</span>
            : homework.slice(0, 8).map((h) => {
                const a: Action = { kind: "MISSING_HOMEWORK", homeworkId: h.id, title: h.title }
                return (
                  <button key={h.id} onClick={() => setAction(is(a) ? null : a)} className="text-caption px-2.5 py-1.5 rounded-pill max-w-[14rem] truncate"
                    style={chip(is(a), RECORD_COLOR.MISSING_HOMEWORK)} title={h.title}>
                    {h.subject ? `${h.subject}：` : ""}{h.title}
                  </button>
                )
              })}
        </Row>
      </div>

      {/* 2. tap students */}
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-body" style={{ color: action ? "var(--color-ink-900)" : "var(--color-ink-400)" }}>
          {action ? <>點學生記錄：<b>{actionLabel(action)}</b></> : "先在上面揀一項，再點學生；冇揀時點學生可以睇本堂紀錄"}
        </p>
        {action && <button onClick={() => setAction(null)} className="text-caption underline" style={{ color: "var(--color-ink-500)" }}>完成</button>}
        {lesson.canUndo && (
          <button onClick={async () => { const e = await lesson.undoLast(); setMsg(e ? { ok: false, text: e } : { ok: true, text: "已復原" }) }}
            className="text-caption px-3 py-1 rounded-input border ml-auto" style={{ border: "1px solid var(--color-border)" }}>
            ↶ 復原上一步
          </button>
        )}
      </div>
      {msg && <p className="text-caption" style={{ color: msg.ok ? "var(--color-curriculum)" : "var(--color-discipline)" }}>{msg.ok ? "✓" : "⚠"} {msg.text}</p>}
      {lesson.error && <p className="text-caption" style={{ color: "var(--color-discipline)" }}>⚠ {lesson.error}</p>}

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(124px, 1fr))" }}>
        {roster.map((s) => {
          const rows = byStudent.get(s.id) ?? []
          const net  = rows.filter((r) => r.kind === "PERFORMANCE").reduce((n, r) => n + r.points, 0)
          const flags = rows.filter((r) => r.kind !== "PERFORMANCE")
          return (
            <div key={s.id} className="rounded-input" style={{ border: `2px solid ${open === s.id ? "var(--color-accent)" : "var(--color-border)"}`, background: "var(--color-surface)" }}>
              <button onClick={() => tap(s.id)} disabled={busy} className="w-full text-left px-2 py-2" style={{ touchAction: "manipulation" }}>
                <span className="text-caption tabular-nums" style={{ color: "var(--color-ink-400)" }}>{s.tag || "—"}</span>
                <span className="block text-body font-medium truncate">{s.name ?? s.nameEn ?? "—"}</span>
                <span className="flex flex-wrap gap-1 mt-1 min-h-[18px]">
                  {net !== 0 && (
                    <span className="text-[10px] px-1.5 rounded-pill text-white" style={{ background: net > 0 ? RECORD_COLOR.PERFORMANCE : RECORD_COLOR.ABSENT }}>
                      {net > 0 ? "+" : ""}{net}
                    </span>
                  )}
                  {flags.map((f) => (
                    <span key={f.id} className="text-[10px] px-1.5 rounded-pill text-white" style={{ background: RECORD_COLOR[f.kind] }}>
                      {RECORD_SHORT[f.kind]}
                    </span>
                  ))}
                </span>
              </button>
              {open === s.id && rows.length > 0 && (
                <ul className="border-t px-2 py-1 space-y-1" style={{ borderColor: "var(--color-border)" }}>
                  {rows.map((r) => (
                    <li key={r.id} className="flex items-center gap-1 text-[11px]">
                      <span style={{ color: RECORD_COLOR[r.kind] }}>{RECORD_LABEL[r.kind]}</span>
                      <span className="truncate" style={{ color: "var(--color-ink-500)" }}>
                        {r.kind === "PERFORMANCE" ? `${r.points > 0 ? "+" : ""}${r.points} ` : ""}{r.tag ?? r.homework?.title ?? ""}
                      </span>
                      {r.awardedAt
                        ? <span className="ml-auto" style={{ color: "var(--color-ink-300)" }}>已發</span>
                        : <button onClick={async () => { const e = await lesson.remove(r.id); if (e) setMsg({ ok: false, text: e }) }}
                            className="ml-auto" style={{ color: "var(--color-discipline)" }}>✕</button>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>

      {/* 3. pay out */}
      <div className="card p-3 flex items-center gap-3 flex-wrap">
        <div className="text-caption flex-1 min-w-[200px]" style={{ color: "var(--color-ink-500)" }}>
          {pending.length > 0
            ? <>待發放：{netBy(pending).map(([id, n]) => `${nameOf(id)} ${n > 0 ? "+" : ""}${n}`).join("、") || "全部抵銷"}</>
            : awarded.length > 0 ? "本堂積點已發放" : "本堂未有課堂表現紀錄"}
        </div>
        {awarded.length > 0 && (
          <button onClick={withdraw} disabled={awarding} className="text-caption px-3 py-2 rounded-input border"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-discipline)" }}>撤回已發放</button>
        )}
        <button onClick={award} disabled={awarding || pending.length === 0 || !sessionId}
          className="px-4 py-2 rounded-input text-body font-medium text-white"
          style={{ background: RECORD_COLOR.PERFORMANCE, opacity: awarding || pending.length === 0 ? 0.5 : 1 }}>
          {awarding ? "處理中…" : "發放積點"}
        </button>
      </div>
    </div>
  )
}

function actionKey(a: Action) {
  return a.kind === "PERFORMANCE"  ? `P|${a.tag}|${a.points}`
       : a.kind === "MISSING_BOOK" ? `B|${a.tag}`
       :                             `H|${a.homeworkId}`
}

function actionLabel(a: Action) {
  if (a.kind === "PERFORMANCE") return `${a.tag} ${a.points > 0 ? "+" : ""}${a.points}`
  if (a.kind === "MISSING_BOOK") return `欠帶${a.tag}`
  return `欠交「${a.title}」`
}

function Row({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-caption font-semibold w-16 shrink-0 pt-1.5" style={{ color }}>{label}</span>
      <div className="flex flex-wrap gap-1.5 flex-1">{children}</div>
    </div>
  )
}
