"use client"

import { Suspense, useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams, useSearchParams } from "next/navigation"
import { SeatingBoard } from "@/components/classroom/SeatingBoard"
import { RosterPanel, type RosterEntry } from "@/components/classroom/RosterPanel"
import { ClassTimer } from "@/components/tools/ClassTimer"
import { RandomPicker, type PickItem } from "@/components/tools/RandomPicker"
import { GroupMaker } from "@/components/tools/GroupMaker"
import { Scoreboard } from "@/components/tools/Scoreboard"
import { ProjectionFrame } from "@/components/tools/ProjectionFrame"
import { RollCall } from "@/components/classroom/RollCall"
import { RecordPanel } from "@/components/classroom/RecordPanel"
import { HomeworkPanel, type HomeworkItem } from "@/components/classroom/HomeworkPanel"
import { ReviewPanel } from "@/components/classroom/ReviewPanel"
import { useLessonRecords } from "@/components/classroom/useLessonRecords"
import { applyGroups, groupMembers, type SeatingLayout } from "@/lib/seating"

// 課堂 desktop for one class or teaching group.
//
// Every tab stays mounted and is only hidden, never unmounted: switching to 抽籤
// halfway through rearranging seats must not throw away the pending autosave.

type Data = {
  cls:     { id: string; name: string; isForm: boolean }
  via:     "admin" | "owner" | "homeroom" | "timetable"
  roster:  RosterEntry[]
  layout:  SeatingLayout
  dropped: number
}

type Session = { id: string; period: number; periodLabel: string | null; subject: string | null; startedAt: string; endedAt: string | null; seq: number }

const VIA: Record<Data["via"], string> = {
  admin: "管理員", owner: "建立者", homeroom: "班主任", timetable: "任教老師",
}

// The lesson's work first, then the tools. Every tab stays mounted (hidden),
// so switching never throws away a pending save.
const MAIN_TABS = [
  ["seating", "座位表"], ["attendance", "點名"], ["records", "紀錄"],
  ["homework", "功課"], ["review", "回顧"], ["roster", "名單"],
] as const
const TOOL_TABS = [
  // Not just 「分組」: the seating board has a 分組 mode, and two controls with
  // the same name side by side is a guaranteed mis-tap.
  ["picker", "抽籤"], ["groups", "隨機分組"], ["timer", "計時"], ["score", "計分牌"],
] as const
type Tab = typeof MAIN_TABS[number][0] | typeof TOOL_TABS[number][0]

export default function ClassroomDesktopPage() {
  return <Suspense fallback={null}><Desktop /></Suspense>
}

function Desktop() {
  const { classId } = useParams<{ classId: string }>()
  const sp = useSearchParams()

  const [data,  setData]  = useState<Data | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab,   setTab]   = useState<Tab>("seating")
  const [session, setSession] = useState<Session | null>(null)
  const [sessionErr, setSessionErr] = useState<string | null>(null)
  const [layout, setLayout] = useState<SeatingLayout | null>(null)
  const [pushed, setPushed] = useState<SeatingLayout | null>(null)
  const [groupMsg, setGroupMsg] = useState<string | null>(null)
  const [boardKey, setBoardKey] = useState(0)
  const [homework, setHomework] = useState<HomeworkItem[]>([])

  const lesson = useLessonRecords(session?.id ?? null)

  const loadHomework = useCallback(async () => {
    const res = await fetch(`/api/classes/${classId}/homework`)
    if (res.ok) setHomework((await res.json()).homework)
  }, [classId])
  useEffect(() => { loadHomework() }, [loadHomework])

  const load = useCallback(async (remountBoard = false) => {
    const res = await fetch(`/api/classes/${classId}/seating`)
    const d = await res.json().catch(() => ({}))
    if (!res.ok) { setError(d?.error ?? `載入失敗 (${res.status})`); return }
    setData(d)
    setLayout(d.layout)
    // A roster change can empty seats server-side (reconcile); remount the
    // board so it starts from that rather than from its own stale copy.
    if (remountBoard) setBoardKey((k) => k + 1)
  }, [classId])

  useEffect(() => { load() }, [load])

  // Open (or resume) this lesson's session. Records in Phase 2 hang off it.
  useEffect(() => {
    const period = parseInt(sp.get("period") ?? "0", 10) || 0
    fetch("/api/classroom/sessions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classId, period,
        periodLabel: sp.get("label"),
        subject:     sp.get("subject"),
        source:      sp.get("source") === "timetable" ? "timetable" : "manual",
      }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (r.ok) setSession(d)
        else if (r.status !== 403) setSessionErr(d?.error ?? "未能開始課堂")
      })
      .catch(() => setSessionErr("未能開始課堂"))
  }, [classId, sp])

  const saveLayout = useCallback(async (l: SeatingLayout): Promise<string | null> => {
    try {
      const res = await fetch(`/api/classes/${classId}/seating`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout: l }),
      })
      if (res.ok) return null
      const d = await res.json().catch(() => ({}))
      return d?.error ?? `HTTP ${res.status}`
    } catch { return "網絡錯誤" }
  }, [classId])

  async function endSession() {
    if (!session || !confirm("完結這一堂？")) return
    const res = await fetch(`/api/classroom/sessions/${session.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ended: true }),
    })
    if (res.ok) setSession(await res.json())
  }

  const items: PickItem[] = useMemo(
    () => (data?.roster ?? []).map((r) => ({ id: r.id, label: r.name ?? r.nameEn ?? "—" })), [data])

  const teams = useMemo(
    () => (layout?.groups ?? []).map((g) => ({ id: g.id, name: g.name, color: g.color })), [layout])

  // 計分牌 → pending 課堂表現 for every member of each seating group. Points per
  // record are capped at 5, so a big tally is split across records.
  async function convertScores(scores: { team: { id: string; name: string }; score: number }[]): Promise<string> {
    if (!layout || !session) return "課堂未開始，未能轉換"
    const members = groupMembers(layout)
    const skipped: string[] = []
    let people = 0
    for (const { team, score } of scores) {
      const ids = members.get(team.id) ?? []
      if (ids.length === 0) { skipped.push(team.name); continue }
      for (let left = score; left > 0; left -= 5) {
        const r = await lesson.record({ kind: "PERFORMANCE", studentIds: ids, points: Math.min(5, left), tag: `搶答計分牌（${team.name}）` })
        if (!r.ok) return `⚠ ${r.message}`
      }
      people += ids.length
    }
    return `✓ 已為 ${people} 位學生加入待發放積點，請到「紀錄」按「發放積點」。` +
      (skipped.length ? `（${skipped.join("、")} 不是座位表分組，未能對應學生）` : "")
  }

  function applyMadeGroups(groups: string[][]) {
    if (!layout) return
    const { layout: next, unseated } = applyGroups(layout, groups)
    setPushed(next)
    setGroupMsg(unseated.length
      ? `已套用；有 ${unseated.length} 人未入座，所以座位表上冇顯示佢哋的組別`
      : "已套用到座位表")
  }

  if (error) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Link href="/teacher/classroom" className="text-caption" style={{ color: "var(--color-ink-400)" }}>← 課堂</Link>
        <div className="card p-8 mt-4 text-center text-body" style={{ color: "var(--color-discipline)" }}>⚠ {error}</div>
      </div>
    )
  }
  if (!data || !layout) {
    return <div className="p-6 text-center text-body" style={{ color: "var(--color-ink-300)" }}>載入中…</div>
  }

  const lessonText = session
    ? [session.periodLabel ?? (session.period ? `第${session.period}節` : null), session.subject].filter(Boolean).join(" · ")
    : null

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <Link href="/teacher/classroom" className="text-caption" style={{ color: "var(--color-ink-400)" }}>← 課堂</Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">{data.cls.name}</h1>
        <span className="text-caption px-2 py-0.5 rounded-pill" style={{ background: "var(--color-surface-2)", color: "var(--color-ink-500)" }}>
          {data.cls.isForm ? "班別" : "教學組"} · {VIA[data.via]}
        </span>
        <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>{data.roster.length} 人</span>
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-4 text-caption" style={{ color: "var(--color-ink-500)" }}>
        {session ? (
          <>
            <span>{lessonText || "手動開啟的課堂"}{session.seq > 1 ? `（今日第 ${session.seq} 次）` : ""}</span>
            <span>開始於 {new Date(session.startedAt).toLocaleTimeString("zh-HK", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Hong_Kong" })}</span>
            {session.endedAt
              ? <span style={{ color: "var(--color-ink-400)" }}>已完結</span>
              : <button onClick={endSession} className="underline">完結課堂</button>}
          </>
        ) : sessionErr ? (
          <span style={{ color: "var(--color-discipline)" }}>⚠ {sessionErr}</span>
        ) : null}
      </div>

      {data.dropped > 0 && (
        <p className="text-caption mb-3" style={{ color: "var(--color-admin)" }}>
          有 {data.dropped} 位學生已不在名單，佢哋原本的座位已清空。
        </p>
      )}

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {[MAIN_TABS, TOOL_TABS].map((group, gi) => (
          <div key={gi} className="flex gap-1 p-1 rounded-input flex-wrap" style={{ background: "var(--color-surface-2)" }}>
            {gi === 1 && <span className="text-caption px-1.5 self-center" style={{ color: "var(--color-ink-300)" }}>工具</span>}
            {group.map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                className="px-3 py-1.5 text-caption font-medium rounded-input"
                style={{
                  background: tab === id ? "var(--color-surface)" : "transparent",
                  color:      tab === id ? "var(--color-ink-900)" : "var(--color-ink-500)",
                  boxShadow:  tab === id ? "0 1px 3px rgb(0 0 0 / 0.06)" : "none",
                }}>{label}</button>
            ))}
          </div>
        ))}
      </div>

      <div hidden={tab !== "seating"}>
        <ProjectionFrame title={`${data.cls.name} 座位表`}>
          {(big) => (
            <SeatingBoard key={boardKey} initial={data.layout} roster={data.roster}
              onSave={saveLayout} onChange={setLayout} externalLayout={pushed}
              exportHref={`/api/classes/${classId}/seating/export`} big={big} />
          )}
        </ProjectionFrame>
      </div>

      <div hidden={tab !== "attendance"}>
        <RollCall roster={data.roster} lesson={lesson} />
      </div>

      <div hidden={tab !== "records"}>
        <RecordPanel roster={data.roster} lesson={lesson} homework={homework} sessionId={session?.id ?? null} />
      </div>

      <div hidden={tab !== "homework"}>
        <HomeworkPanel classId={classId} roster={data.roster} homework={homework} onChanged={loadHomework}
          lesson={lesson} sessionId={session?.id ?? null} defaultSubject={session?.subject ?? null} />
      </div>

      <div hidden={tab !== "review"}>
        {/* Mounted only when opened: it queries the whole term. */}
        {tab === "review" && <ReviewPanel classId={classId} className={data.cls.name} roster={data.roster} />}
      </div>

      <div hidden={tab !== "roster"}>
        <RosterPanel classId={classId} roster={data.roster} onChanged={() => load(true)} />
      </div>

      <div hidden={tab !== "picker"}>
        <ProjectionFrame title="抽籤">
          {(big) => <RandomPicker items={items} big={big} />}
        </ProjectionFrame>
      </div>

      <div hidden={tab !== "groups"}>
        <ProjectionFrame title="隨機分組">
          {(big) => (
            <div className="space-y-2">
              <GroupMaker items={items} onApply={applyMadeGroups} big={big} />
              {groupMsg && <p className="text-caption" style={{ color: "var(--color-curriculum)" }}>✓ {groupMsg}</p>}
            </div>
          )}
        </ProjectionFrame>
      </div>

      <div hidden={tab !== "timer"}>
        <ProjectionFrame title="計時">
          {(big) => <ClassTimer big={big} />}
        </ProjectionFrame>
      </div>

      <div hidden={tab !== "score"}>
        <ProjectionFrame title="搶答計分牌">
          {(big) => <Scoreboard teams={teams} storageKey={`kc-scoreboard-${classId}`} big={big} onConvert={convertScores} />}
        </ProjectionFrame>
      </div>
    </div>
  )
}
