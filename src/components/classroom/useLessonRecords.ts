"use client"

import { useCallback, useEffect, useState } from "react"
import type { LessonRecordKindValue } from "@/lib/lesson-records"

// This lesson's records, shared by 點名, 紀錄 and 功課 so they stay in step:
// marking someone absent in 點名 shows up immediately on their card in 紀錄.

export type LessonRecordRow = {
  id: string
  studentId: string
  kind: LessonRecordKindValue
  tag: string | null
  note: string | null
  points: number
  homeworkId: string | null
  awardedAt: string | null
  resolved: boolean
  createdAt: string
  homework: { id: string; title: string } | null
}

export type RecordInput = {
  kind: LessonRecordKindValue
  studentIds: string[]
  tag?: string
  note?: string
  points?: number
  homeworkId?: string
}

export function useLessonRecords(sessionId: string | null) {
  const [records, setRecords] = useState<LessonRecordRow[]>([])
  const [error,   setError]   = useState<string | null>(null)
  const [lastIds, setLastIds] = useState<string[]>([])

  const refresh = useCallback(async () => {
    if (!sessionId) return
    const res = await fetch(`/api/classroom/sessions/${sessionId}/records`)
    const d = await res.json().catch(() => ({}))
    if (res.ok) { setRecords(d.records); setError(null) }
    else setError(d?.error ?? `載入紀錄失敗 (${res.status})`)
  }, [sessionId])

  useEffect(() => { refresh() }, [refresh])

  /** Record something; returns a message to show, or null. */
  const record = useCallback(async (input: RecordInput): Promise<{ ok: boolean; message: string }> => {
    if (!sessionId) return { ok: false, message: "課堂未開始，未能記錄" }
    const before = new Set(records.map((r) => r.id))
    const res = await fetch(`/api/classroom/sessions/${sessionId}/records`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, message: d?.error ?? `記錄失敗 (${res.status})` }
    setRecords(d.records)
    setLastIds((d.records as LessonRecordRow[]).filter((r) => !before.has(r.id)).map((r) => r.id))
    const extra = d.alreadyRecorded ? `（${d.alreadyRecorded} 人早已記錄）` : ""
    return { ok: true, message: `已記錄 ${d.created} 人${extra}` }
  }, [sessionId, records])

  const remove = useCallback(async (id: string): Promise<string | null> => {
    const res = await fetch(`/api/lesson-records/${id}`, { method: "DELETE" })
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      return d?.error ?? `刪除失敗 (${res.status})`
    }
    setRecords((rs) => rs.filter((r) => r.id !== id))
    setLastIds((ids) => ids.filter((x) => x !== id))
    return null
  }, [])

  /** 復原: delete whatever the last record() call created. */
  const undoLast = useCallback(async (): Promise<string | null> => {
    for (const id of lastIds) {
      const err = await remove(id)
      if (err) return err
    }
    setLastIds([])
    return null
  }, [lastIds, remove])

  return { records, error, refresh, record, remove, undoLast, canUndo: lastIds.length > 0 }
}
