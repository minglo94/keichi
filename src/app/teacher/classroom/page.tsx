"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import type { CurrentLesson, LessonRef } from "@/lib/current-lesson"
import type { ClassMatch } from "@/lib/class-link"

// 課堂 — opens on the lesson being taught right now.
//
// Every way of *not* knowing which lesson that is gets its own honest message
// and falls back to the picker. It must never show an empty page that reads as
// "you have no lesson", when the truth is "we couldn't match you to the
// timetable".

type ClassItem = { id: string; name: string; count: number; isForm: boolean; via?: string | null; openable?: boolean }
type Current = { lesson: CurrentLesson; classMatch: ClassMatch | null; mine: ClassItem[]; others: ClassItem[] }

const VIA: Record<string, string> = { owner: "建立者", homeroom: "班主任", timetable: "任教" }

function desktopHref(classId: string, l: LessonRef | null) {
  if (!l) return `/teacher/classroom/${classId}`
  const qs = new URLSearchParams({ period: String(l.period), label: l.label, source: "timetable" })
  if (l.subject) qs.set("subject", l.subject)
  return `/teacher/classroom/${classId}?${qs}`
}

export default function ClassroomPage() {
  const router = useRouter()
  const [data,  setData]  = useState<Current | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q,     setQ]     = useState("")
  const [showAll, setShowAll] = useState(false)
  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)
  const [createErr, setCreateErr] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/classroom/current")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (r.ok) setData(d)
        else setError(d?.error ?? `載入失敗 (${r.status})`)
      })
      .catch(() => setError("網絡錯誤，請重試"))
  }, [])

  async function createClass(name: string, then?: (id: string) => string) {
    name = name.trim()
    if (!name) return
    setCreating(true); setCreateErr(null)
    const res = await fetch("/api/classes", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    })
    const d = await res.json().catch(() => ({}))
    setCreating(false)
    if (!res.ok) { setCreateErr(d?.error ?? `建立失敗 (${res.status})`); return }
    // Straight to the 名單 tab: a new class has no students yet.
    router.push(then ? then(d.id) : `/teacher/classroom/${d.id}`)
  }

  const filteredOthers = useMemo(() => {
    const k = q.trim().toLowerCase()
    return (data?.others ?? []).filter((c) => !k || c.name.toLowerCase().includes(k))
  }, [data, q])

  if (error) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-h1 mb-4">課堂</h1>
        <div className="card p-6 text-body" style={{ color: "var(--color-discipline)" }}>⚠ {error}</div>
      </div>
    )
  }
  if (!data) return <div className="p-6 text-center text-body" style={{ color: "var(--color-ink-300)" }}>載入中…</div>

  const { lesson, classMatch } = data
  const ref = lesson.kind === "now" ? lesson.lesson : lesson.kind === "next" ? lesson.next : null

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-h1">課堂</h1>
        <p className="text-caption mt-1" style={{ color: "var(--color-ink-400)" }}>
          按你的時間表打開現在這一堂；亦可以揀任何你任教的班別或教學組。
        </p>
      </div>

      <LessonBanner lesson={lesson} classMatch={classMatch} lessonRef={ref}
        onCreate={(name) => createClass(name, (id) => `${desktopHref(id, ref)}`)} creating={creating} />

      {/* My classes */}
      <section>
        <h2 className="text-h3 mb-2">我的班別及教學組</h2>
        {data.mine.length === 0 ? (
          <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>
            未有你建立、擔任班主任或按時間表任教的班別。可以在下面建立，或在「全校班別」中尋找。
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {data.mine.map((c) => (
              <Link key={c.id} href={`/teacher/classroom/${c.id}`}
                className="card p-3 hover:shadow-card-md transition-shadow">
                <p className="text-h3">{c.name}</p>
                <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>
                  {c.count} 人 · {c.isForm ? "班別" : "教學組"}{c.via ? ` · ${VIA[c.via] ?? ""}` : ""}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Create */}
      <section className="card p-4">
        <h2 className="text-h3 mb-1">建立班別或教學組</h2>
        <p className="text-caption mb-3" style={{ color: "var(--color-ink-400)" }}>
          班別用班名（例如 3A）；跨班的選修或輔導組可以自訂名稱（例如「中四物理選修」）。建立後到「名單」加入學生。
        </p>
        <div className="flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={50}
            onKeyDown={(e) => e.key === "Enter" && createClass(newName)}
            placeholder="3A 或 中四物理選修"
            className="flex-1 px-3 py-2 text-body rounded-input border outline-none"
            style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }} />
          <button onClick={() => createClass(newName)} disabled={creating || !newName.trim()}
            className="px-4 py-2 rounded-input text-body font-medium text-white"
            style={{ background: "var(--color-accent)", opacity: creating || !newName.trim() ? 0.6 : 1 }}>
            {creating ? "建立中…" : "建立"}
          </button>
        </div>
        {createErr && <p className="text-caption mt-2" style={{ color: "var(--color-discipline)" }}>⚠ {createErr}</p>}
      </section>

      {/* Whole school */}
      <section>
        <button onClick={() => setShowAll((s) => !s)} className="text-caption font-medium" style={{ color: "var(--color-accent)" }}>
          {showAll ? "▾" : "▸"} 全校班別（{data.others.length}）
        </button>
        {showAll && (
          <div className="mt-2 space-y-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋班別…"
              className="w-full px-3 py-2 text-body rounded-input border outline-none"
              style={{ border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }} />
            <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>
              只可以打開你任教、擔任班主任或建立的班別；如果時間表上有教但開唔到，請檢查「教師資料」的時間表姓名。
            </p>
            <div className="flex flex-wrap gap-1.5">
              {filteredOthers.map((c) => (
                c.openable
                  ? <Link key={c.id} href={`/teacher/classroom/${c.id}`} className="text-caption px-2.5 py-1 rounded-pill border"
                      style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}>{c.name}（{c.count}）</Link>
                  : <span key={c.id} className="text-caption px-2.5 py-1 rounded-pill"
                      style={{ background: "var(--color-surface-2)", color: "var(--color-ink-300)" }}>{c.name}</span>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

function LessonBanner({
  lesson, classMatch, lessonRef, onCreate, creating,
}: {
  lesson: CurrentLesson
  classMatch: ClassMatch | null
  lessonRef: LessonRef | null
  onCreate: (name: string) => void
  creating: boolean
}) {
  const box = (tone: string, children: React.ReactNode) => (
    <div className="card p-5" style={{ borderLeft: `4px solid ${tone}` }}>{children}</div>
  )
  const teacherFix = (
    <Link href="/teacher/admin/teachers" className="underline">教師資料</Link>
  )

  switch (lesson.kind) {
    case "not-configured":
      return box("var(--color-admin)", <>
        <p className="text-h3">未能自動偵測課堂</p>
        <p className="text-caption mt-1" style={{ color: "var(--color-ink-500)" }}>
          學校尚未設定節次時間（例如第3節 09:50–10:25）。管理員可到 教師進修 → 設定 → 使用預設時間。下面可以手動揀班。
        </p>
      </>)
    case "no-timetable":
      return box("var(--color-admin)", <>
        <p className="text-h3">未能自動偵測課堂</p>
        <p className="text-caption mt-1" style={{ color: "var(--color-ink-500)" }}>
          系統未有現用的時間表。管理員可到 AI 助理管理 → 時間表 上載。下面可以手動揀班。
        </p>
      </>)
    case "no-teacher-match":
      return box("var(--color-admin)", <>
        <p className="text-h3">找不到你的時間表</p>
        <p className="text-caption mt-1" style={{ color: "var(--color-ink-500)" }}>
          時間表上冇對應「{lesson.tried.join("／") || "你的名字"}」的老師，所以未能知道你現在教邊班
          （並不代表你冇課）。可以在 {teacherFix} 設定「時間表姓名」。下面可以手動揀班。
        </p>
      </>)
    case "not-teaching-day":
      return box("var(--color-ink-300)", <p className="text-h3">今日：{lesson.reason}</p>)
    case "no-lessons-today":
      return box("var(--color-ink-300)", <p className="text-h3">{lesson.reason}</p>)
    case "unknown-slot":
      return box("var(--color-admin)", <>
        <p className="text-h3">今日有課，但未知時間</p>
        <p className="text-caption mt-1" style={{ color: "var(--color-ink-500)" }}>
          {lesson.lesson.label} {lesson.lesson.classCode ?? ""} {lesson.lesson.subject ?? ""} — {lesson.reason}
        </p>
      </>)
    case "done-for-day":
      return box("var(--color-ink-300)", <>
        <p className="text-h3">今日的課已完結</p>
        <p className="text-caption mt-1" style={{ color: "var(--color-ink-500)" }}>
          今日：{lesson.lessonsToday.map((l) => `${l.label} ${l.classCode ?? ""}`).join("、")}
        </p>
      </>)
  }

  // now / next
  const l = lessonRef!
  const isNow = lesson.kind === "now"
  const heading = `${isNow ? "現在" : lesson.reason === "before-school" ? "今日第一堂" : "下一堂"}：${l.label}${l.startTime ? `（${l.startTime}–${l.endTime}）` : ""}`
  const note = lesson.note

  return box(isNow ? "var(--color-accent)" : "var(--color-ink-300)", <>
    <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>{heading}</p>
    <p className="text-h2 mt-0.5">{[l.classCode, l.subject].filter(Boolean).join(" · ") || "（時間表未有班別）"}</p>
    {note && <p className="text-caption mt-1" style={{ color: "var(--color-ink-500)" }}>{note}</p>}

    <div className="mt-3 flex items-center gap-2 flex-wrap">
      {classMatch?.kind === "one" && (
        <>
          <Link href={desktopHref(classMatch.classId, l)}
            className="px-5 py-2.5 rounded-input text-body font-medium text-white" style={{ background: "var(--color-accent)" }}>
            進入 {classMatch.name} 課堂 →
          </Link>
          {classMatch.scope === "school" && (
            <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>此班別由其他老師建立</span>
          )}
        </>
      )}
      {classMatch?.kind === "many" && (
        <>
          <span className="text-caption" style={{ color: "var(--color-ink-500)" }}>有幾個同名班別，請揀：</span>
          {classMatch.candidates.map((c) => (
            <Link key={c.classId} href={desktopHref(c.classId, l)} className="text-caption px-3 py-1.5 rounded-input border"
              style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}>{c.name}</Link>
          ))}
        </>
      )}
      {classMatch?.kind === "none" && (
        <>
          <span className="text-caption" style={{ color: "var(--color-ink-500)" }}>
            系統未有「{l.classCode ?? "此班"}」的班別名單。
          </span>
          {classMatch.suggestedName && (
            <button onClick={() => onCreate(classMatch.suggestedName)} disabled={creating}
              className="text-caption px-3 py-1.5 rounded-input text-white" style={{ background: "var(--color-accent)", opacity: creating ? 0.6 : 1 }}>
              建立班別 {classMatch.suggestedName}
            </button>
          )}
          <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>或在下面揀已有的班別</span>
        </>
      )}
    </div>
  </>)
}
