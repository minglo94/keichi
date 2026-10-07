"use client"

import { useState } from "react"
import type { RosterEntry } from "@/components/classroom/RosterPanel"
import type { useLessonRecords } from "@/components/classroom/useLessonRecords"

// 點名. Everyone starts present — only exceptions are stored. Each tap cycles
// a student 在 → 缺席 → 遲到 → 在, so a whole class takes a few taps.

type Lesson = ReturnType<typeof useLessonRecords>

const STATES = {
  present: { label: "在",   bg: "var(--color-surface)", fg: "var(--color-ink-900)", border: "var(--color-border)" },
  ABSENT:  { label: "缺席", bg: "#fee2e2", fg: "#991b1b", border: "#fca5a5" },
  LATE:    { label: "遲到", bg: "#ffedd5", fg: "#9a3412", border: "#fdba74" },
}

export function RollCall({ roster, lesson }: { roster: RosterEntry[]; lesson: Lesson }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [msg,  setMsg]  = useState<string | null>(null)

  const stateOf = (id: string) => {
    const r = lesson.records.find((x) => x.studentId === id && (x.kind === "ABSENT" || x.kind === "LATE"))
    return r ? { kind: r.kind as "ABSENT" | "LATE", id: r.id } : null
  }

  async function cycle(studentId: string) {
    if (busy) return
    setBusy(studentId); setMsg(null)
    const cur = stateOf(studentId)
    let err: string | null = null
    if (!cur) {
      const r = await lesson.record({ kind: "ABSENT", studentIds: [studentId] })
      if (!r.ok) err = r.message
    } else if (cur.kind === "ABSENT") {
      // The server replaces 缺席 with 遲到 — they answer the same question.
      const r = await lesson.record({ kind: "LATE", studentIds: [studentId] })
      if (!r.ok) err = r.message
    } else {
      err = await lesson.remove(cur.id)
    }
    if (err) setMsg(err)
    setBusy(null)
  }

  const absent = roster.filter((s) => stateOf(s.id)?.kind === "ABSENT")
  const late   = roster.filter((s) => stateOf(s.id)?.kind === "LATE")

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-body">
        <span>出席 <b>{roster.length - absent.length}</b>／{roster.length}</span>
        <span style={{ color: STATES.ABSENT.fg }}>缺席 <b>{absent.length}</b></span>
        <span style={{ color: STATES.LATE.fg }}>遲到 <b>{late.length}</b></span>
        <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>點學生切換：在 → 缺席 → 遲到 → 在</span>
      </div>
      {absent.length > 0 && (
        <p className="text-caption" style={{ color: STATES.ABSENT.fg }}>
          缺席：{absent.map((s) => `${s.tag} ${s.name ?? ""}`.trim()).join("、")}
        </p>
      )}
      {msg && <p className="text-caption" style={{ color: "var(--color-discipline)" }}>⚠ {msg}</p>}

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(112px, 1fr))" }}>
        {roster.map((s) => {
          const st = STATES[stateOf(s.id)?.kind ?? "present"]
          return (
            <button key={s.id} onClick={() => cycle(s.id)} disabled={busy === s.id}
              className="rounded-input px-2 py-2.5 text-left"
              style={{ background: st.bg, color: st.fg, border: `2px solid ${st.border}`, opacity: busy === s.id ? 0.6 : 1, touchAction: "manipulation" }}>
              <span className="block text-caption tabular-nums opacity-70">{s.tag || "—"}</span>
              <span className="block text-body font-medium truncate">{s.name ?? s.nameEn ?? "—"}</span>
              <span className="block text-caption font-semibold">{st.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
