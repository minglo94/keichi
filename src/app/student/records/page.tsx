"use client"

import { useEffect, useState } from "react"
import {
  BEHAVIOR_LABEL, BEHAVIOR_COLOR, BEHAVIOR_ORDER, type BehaviorTypeValue,
} from "@/lib/behavior-types"
import {
  FOLLOW_UP_KINDS, RECORD_COLOR, RECORD_LABEL, type LessonRecordKindValue,
} from "@/lib/lesson-records"

type LessonRec = {
  id: string; kind: LessonRecordKindValue; date: string; subject: string | null
  tag: string | null; note: string | null; points: number; resolved: boolean
  class: { name: string }; homework: { title: string } | null
}

type StudentRecord = {
  id:          string
  date:        string
  className:   string
  type:        BehaviorTypeValue
  description: string
  action:      string | null
  resolved:    boolean
}

export default function StudentRecordsPage() {
  const [records, setRecords] = useState<StudentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [lesson,  setLesson]  = useState<LessonRec[]>([])

  useEffect(() => {
    fetch("/api/me/lesson-records").then((r) => (r.ok ? r.json() : { records: [] })).then((d) => setLesson(d.records ?? []))
  }, [])

  useEffect(() => {
    fetch("/api/student/records")
      .then((r) => r.ok ? r.json() : { records: [] })
      .then((d) => setRecords(d.records ?? []))
      .finally(() => setLoading(false))
  }, [])

  const counts: Record<string, number> = {}
  for (const r of records) counts[r.type] = (counts[r.type] ?? 0) + 1

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto">
      <h1 className="text-h1 mb-1">我的行為記錄</h1>
      <p className="text-caption mb-6" style={{ color: "var(--color-ink-400)" }}>
        由老師記錄的優點、缺點、小過、大過、遲到及缺席紀錄，以及本學年的課堂紀錄。
      </p>

      <LessonRecords records={lesson} />

      <h2 className="text-h3 mb-3">行為記錄</h2>

      {/* Summary — one tile per category */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6">
        {BEHAVIOR_ORDER.map((t) => (
          <div key={t} className="card p-3 text-center">
            <p className="text-h2" style={{ color: BEHAVIOR_COLOR[t] }}>{counts[t] ?? 0}</p>
            <p className="text-[11px]" style={{ color: "var(--color-ink-500)" }}>{BEHAVIOR_LABEL[t]}</p>
          </div>
        ))}
      </div>

      {loading ? (
        <p className="text-body text-center py-12" style={{ color: "var(--color-ink-300)" }}>載入中…</p>
      ) : records.length === 0 ? (
        <div className="card p-8 text-center" style={{ color: "var(--color-ink-300)" }}>
          <p className="text-body">暫無記錄</p>
        </div>
      ) : (
        <div className="space-y-3">
          {records.map((r) => {
            const color = BEHAVIOR_COLOR[r.type]
            return (
              <div key={r.id} className="card p-4" style={{ borderLeft: `3px solid ${color}` }}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-caption px-2 py-0.5 rounded-pill" style={{ background: `${color}20`, color }}>
                    {BEHAVIOR_LABEL[r.type]}
                  </span>
                  <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>
                    {r.className} · {new Date(r.date).toLocaleDateString("zh-HK")}
                  </span>
                  {r.resolved && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded ml-auto" style={{ background: "var(--color-surface-2)", color: "var(--color-ink-400)" }}>
                      已處理
                    </span>
                  )}
                </div>
                <p className="text-body" style={{ color: "var(--color-ink-900)" }}>{r.description}</p>
                {r.action && (
                  <p className="text-caption mt-1" style={{ color: "var(--color-ink-500)" }}>跟進：{r.action}</p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// 課堂紀錄 — this school year's records from 課堂: 欠帶書本, 欠交功課, 缺席未交,
// lesson absences and lateness, and 課堂表現 once the teacher has awarded it.
function LessonRecords({ records }: { records: LessonRec[] }) {
  const count = (k: LessonRecordKindValue) => records.filter((r) => r.kind === k).length
  return (
    <section className="mb-8">
      <h2 className="text-h3 mb-3">課堂紀錄（本學年）</h2>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-4">
        {FOLLOW_UP_KINDS.map((k) => (
          <div key={k} className="card p-3 text-center">
            <p className="text-h2" style={{ color: count(k) ? RECORD_COLOR[k] : "var(--color-ink-200)" }}>{count(k)}</p>
            <p className="text-[11px]" style={{ color: "var(--color-ink-500)" }}>{RECORD_LABEL[k]}</p>
          </div>
        ))}
      </div>
      {records.length === 0 ? (
        <div className="card p-6 text-center text-body" style={{ color: "var(--color-ink-300)" }}>暫無課堂紀錄</div>
      ) : (
        <div className="card divide-y" style={{ borderColor: "var(--color-border)" }}>
          {records.map((r) => (
            <div key={r.id} className="px-4 py-2.5 flex items-start gap-3">
              <span className="text-caption px-2 py-0.5 rounded-pill shrink-0" style={{ background: `${RECORD_COLOR[r.kind]}20`, color: RECORD_COLOR[r.kind] }}>
                {RECORD_LABEL[r.kind]}{r.kind === "PERFORMANCE" ? ` ${r.points > 0 ? "+" : ""}${r.points}` : ""}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-body" style={{ color: "var(--color-ink-900)" }}>{[r.tag, r.homework?.title, r.note].filter(Boolean).join("　") || "—"}</p>
                <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>
                  {r.class.name}{r.subject ? ` · ${r.subject}` : ""} · {new Date(r.date).toLocaleDateString("zh-HK", { timeZone: "Asia/Hong_Kong" })}
                  {r.resolved && " · 已跟進"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
