"use client"

import { useCallback, useEffect, useState } from "react"
import { CollectSheet } from "@/components/classroom/CollectSheet"

// 我的課堂 — this week's homework for every class the student is in.
//
// A 課代表 also gets two jobs here: 記錄功課 (for their subject) and 收功課 —
// collecting a homework the teacher already set and ticking who hasn't handed
// it in, against that same homework. The server enforces who may do what;
// these buttons only appear for convenience.

type Hw = {
  id: string; subject: string | null; title: string; detail: string | null
  assignedOn: string; dueDate: string | null; byRep: boolean; recorderName: string | null
  confirmed: boolean; mine: boolean
  iMissed: { absent: boolean; followedUp: boolean } | null
  canCollect: boolean
}
type Cls = { id: string; name: string; repSubjects: string[] | null; homework: Hw[] }

const hkYmd = (iso: string) => new Date(new Date(iso).getTime() + 8 * 3600_000).toISOString().slice(0, 10)
const today = () => hkYmd(new Date().toISOString())

function dueLabel(due: string | null): { text: string; tone: string } | null {
  if (!due) return null
  const d = hkYmd(due), t = today()
  const days = Math.round((new Date(d).getTime() - new Date(t).getTime()) / 86_400_000)
  if (days < 0)  return { text: `${d.slice(5)} 已過限期`, tone: "var(--color-ink-400)" }
  if (days === 0) return { text: "今日交", tone: "var(--color-discipline)" }
  if (days === 1) return { text: "明日交", tone: "#c2410c" }
  return { text: `${d.slice(5)} 交`, tone: "var(--color-ink-500)" }
}

export default function StudentClassroomPage() {
  const [classes, setClasses] = useState<Cls[] | null>(null)
  const [error,   setError]   = useState<string | null>(null)
  const [collect, setCollect] = useState<{ classId: string; hwId: string } | null>(null)
  const [adding,  setAdding]  = useState<Cls | null>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/me/homework")
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setError(d?.error ?? `載入失敗 (${res.status})`); return }
    setClasses(d.classes)
  }, [])
  useEffect(() => { load() }, [load])

  async function removeMine(c: Cls, h: Hw) {
    if (!confirm(`刪除「${h.title}」？`)) return
    const res = await fetch(`/api/classes/${c.id}/homework/${h.id}`, { method: "DELETE" })
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d?.error ?? "刪除失敗"); return }
    load()
  }

  if (error) return <div className="p-6"><div className="card p-6 text-body" style={{ color: "var(--color-discipline)" }}>⚠ {error}</div></div>
  if (!classes) return <div className="p-6 text-center text-body" style={{ color: "var(--color-ink-300)" }}>載入中…</div>

  // Both still owe it: 欠交, and absent-on-the-day 缺席未交.
  const missedCount = classes.reduce((n, c) => n + c.homework.filter((h) => h.iMissed && !h.iMissed.followedUp).length, 0)

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-h1">我的課堂</h1>
        <p className="text-caption mt-1" style={{ color: "var(--color-ink-400)" }}>未交及最近三星期的功課。</p>
      </div>

      {missedCount > 0 && (
        <div className="card p-3 text-body" style={{ borderLeft: "4px solid #7c3aed" }}>
          你有 <b>{missedCount}</b> 份功課未交（欠交或缺席當日），請盡快補交。
        </div>
      )}

      {classes.length === 0 && (
        <div className="card p-6 text-center text-body" style={{ color: "var(--color-ink-400)" }}>你未加入任何班別。</div>
      )}

      {classes.map((c) => (
        <section key={c.id} className="card overflow-hidden">
          <div className="px-4 py-3 flex items-center gap-2 flex-wrap" style={{ borderBottom: "1px solid var(--color-border)" }}>
            <h2 className="text-h3">{c.name}</h2>
            {c.repSubjects && (
              <span className="text-caption px-2 py-0.5 rounded-pill" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
                {c.repSubjects.includes("") ? "課代表" : `${c.repSubjects.join("、")}科代表`}
              </span>
            )}
            {c.repSubjects && (
              <button onClick={() => setAdding(c)} className="ml-auto text-caption px-3 py-1.5 rounded-input text-white" style={{ background: "var(--color-accent)" }}>
                ＋ 記錄功課
              </button>
            )}
          </div>

          {c.homework.length === 0 ? (
            <p className="p-4 text-caption" style={{ color: "var(--color-ink-300)" }}>未有功課</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: "var(--color-border)" }}>
              {c.homework.map((h) => {
                const due = dueLabel(h.dueDate)
                return (
                  <li key={h.id} className="px-4 py-3 flex items-start gap-3 flex-wrap">
                    <div className="flex-1 min-w-[180px]">
                      <p className="text-body" style={{ color: "var(--color-ink-900)" }}>
                        {h.subject && <span className="text-caption mr-1.5 px-1.5 py-0.5 rounded-pill" style={{ background: "var(--color-surface-2)" }}>{h.subject}</span>}
                        {h.title}
                      </p>
                      {h.detail && <p className="text-caption mt-0.5" style={{ color: "var(--color-ink-500)" }}>{h.detail}</p>}
                      <p className="text-caption mt-0.5 flex gap-2 flex-wrap" style={{ color: "var(--color-ink-400)" }}>
                        {due && <span style={{ color: due.tone, fontWeight: 600 }}>{due.text}</span>}
                        {h.byRep && <span>課代表 {h.recorderName} 記錄{h.confirmed ? " · 老師已覆核" : ""}</span>}
                        {h.iMissed && (
                          <span style={{ color: h.iMissed.absent ? "#64748b" : "#7c3aed", fontWeight: 600 }}>
                            {h.iMissed.absent ? "你當日缺席，請補交" : "你欠交咗"}{h.iMissed.followedUp ? "（已跟進）" : ""}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex gap-1.5 items-center">
                      {h.canCollect && (
                        <button onClick={() => setCollect({ classId: c.id, hwId: h.id })}
                          className="text-caption px-3 py-1.5 rounded-input border" style={{ border: "1px solid var(--color-border)", color: "#7c3aed" }}>
                          收功課
                        </button>
                      )}
                      {h.mine && !h.confirmed && (
                        <button onClick={() => removeMine(c, h)} className="text-caption px-2" style={{ color: "var(--color-discipline)" }}>刪除</button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ))}

      {collect && (
        <CollectSheet classId={collect.classId} homeworkId={collect.hwId} teacher={false}
          onClose={() => { setCollect(null); load() }} />
      )}
      {adding && <AddHomework cls={adding} onClose={() => setAdding(null)} onSaved={() => { setAdding(null); load() }} />}
    </div>
  )
}

function AddHomework({ cls, onClose, onSaved }: { cls: Cls; onClose: () => void; onSaved: () => void }) {
  const subjects = cls.repSubjects ?? []
  const anySubject = subjects.includes("")
  const [subject, setSubject] = useState(anySubject ? "" : subjects[0] ?? "")
  const [title,   setTitle]   = useState("")
  const [detail,  setDetail]  = useState("")
  const [due,     setDue]     = useState("")
  const [busy,    setBusy]    = useState(false)
  const [err,     setErr]     = useState<string | null>(null)

  async function save() {
    if (!title.trim()) return
    setBusy(true); setErr(null)
    const res = await fetch(`/api/classes/${cls.id}/homework`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title.trim(), subject: subject.trim() || undefined, detail: detail.trim() || undefined, dueDate: due || null }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setErr(d?.error ?? `儲存失敗 (${res.status})`); return }
    onSaved()
  }

  const field = "w-full px-3 py-2 text-body rounded-input border outline-none"
  const style = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 sm:p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white w-full sm:max-w-md rounded-t-card sm:rounded-card p-5 space-y-3">
        <h3 className="text-h3">記錄功課：{cls.name}</h3>
        {anySubject
          ? <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="科目" maxLength={30} className={field} style={style} />
          : <select value={subject} onChange={(e) => setSubject(e.target.value)} className={field} style={style}>
              {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="功課（例如：工作紙 P.12-13）" maxLength={120} className={field} style={style} />
        <textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="補充（選填）" rows={2} maxLength={2000} className={`${field} resize-none`} style={style} />
        <label className="flex items-center gap-2 text-caption" style={{ color: "var(--color-ink-500)" }}>
          限期 <input type="date" value={due} min={today()} onChange={(e) => setDue(e.target.value)} className="px-2 py-1.5 rounded-input border" style={style} />
        </label>
        <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>老師會收到通知，並可以覆核。</p>
        {err && <p className="text-caption" style={{ color: "var(--color-discipline)" }}>⚠ {err}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-input border text-body" style={{ border: "1px solid var(--color-border)" }}>取消</button>
          <button onClick={save} disabled={busy || !title.trim()} className="px-4 py-2 rounded-input text-body font-medium text-white"
            style={{ background: "var(--color-accent)", opacity: busy || !title.trim() ? 0.6 : 1 }}>{busy ? "儲存中…" : "記錄"}</button>
        </div>
      </div>
    </div>
  )
}
