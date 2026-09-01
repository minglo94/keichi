"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { StaffPicker } from "@/components/teacher/StaffPicker"
import { DEFAULT_PERIODS } from "@/lib/school-periods"
import { COMMITTEES, SUBJECTS } from "@/lib/school-org"
import { FreeSlotsPanel } from "@/components/teacher/FreeSlotsPanel"

type Staff = { id: string; name: string | null; nameEn: string | null; email: string | null; image: string | null }

type Check =
  | { date: string; kind: "clear";          reason: string }
  | { date: string; kind: "clash";          lessons: string[] }
  | { date: string; kind: "no-data";        teacherName: string }
  | { date: string; kind: "not-configured" }

type Application = {
  id: string; teacherName: string; title: string; organiser: string | null
  startDate: string; endDate: string; startTime: string; endTime: string
  status: "PENDING" | "APPROVED" | "REJECTED"
  clashSummary: string | null; approvedWithClash: boolean
  rejectionReason: string | null; reviewedAt: string | null
  teacher: { id: string; name: string | null }
  reviewedBy: { id: string; name: string | null } | null
}

type Profile = {
  id: string; name: string | null; nameEn: string | null; email: string | null
  departments: string[]; committees: string[]; pdCount: number
}

type Period      = { period: number | null; label: string | null; startTime: string; endTime: string }
type NonTeaching = { id?: string; name: string; type: "HOLIDAY" | "EXAM"; startDate: string; endDate: string; freeFrom: string | null }
type DocLink     = { id?: string; label: string; url: string }

const STATUS = {
  PENDING:  { label: "待批核", color: "var(--color-admin)" },
  APPROVED: { label: "已批核", color: "var(--color-curriculum)" },
  REJECTED: { label: "已退回", color: "var(--color-discipline)" },
}

const DAYS = ["", "星期一", "星期二", "星期三", "星期四", "星期五"]

// Half-hour steps across the whole day, per the spec (7:00, 7:30, 13:00…).
const TIMES = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`)

const todayYmd = () => new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10)

export default function PdPage() {
  const [tab, setTab] = useState<"apply" | "records" | "info" | "free" | "settings">("apply")
  const [staff, setStaff] = useState<Staff[]>([])
  const [denied, setDenied] = useState(false)

  useEffect(() => {
    // Loaded once and filtered in the browser, so ask for the whole staff list —
    // the default limit is sized for a server-side type-ahead.
    fetch("/api/users?take=500").then((r) => r.ok ? r.json() : []).then((d) => setStaff(Array.isArray(d) ? d : []))
    fetch("/api/pd/settings").then((r) => { if (r.status === 403) setDenied(true) })
  }, [])

  const inputCls   = "w-full px-3 py-2 text-body rounded-input border outline-none"
  const inputStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }

  if (denied) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="card p-8 text-center text-body" style={{ color: "var(--color-ink-400)" }}>
          僅管理員或行政組主席可使用此模組。
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/teacher/committee/admin" className="text-caption" style={{ color: "var(--color-ink-400)" }}>← 行政</Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">教師進修</h1>
      </div>
      <p className="text-caption mb-5" style={{ color: "var(--color-ink-400)" }}>
        登記及批核教師進修申請。系統會對照教師時間表、假期及考試安排，檢查有冇上課衝突。
      </p>

      <div className="flex gap-1 p-1 rounded-input mb-5 flex-wrap" style={{ background: "var(--color-surface-2)" }}>
        {([["apply","申請"],["records","紀錄"],["info","資料"],["free","共同空堂"],["settings","設定"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className="px-3 py-1.5 text-caption font-medium rounded-input transition-colors"
            style={{
              background: tab === id ? "var(--color-surface)" : "transparent",
              color:      tab === id ? "var(--color-ink-900)" : "var(--color-ink-500)",
              boxShadow:  tab === id ? "0 1px 3px rgb(0 0 0 / 0.06)" : "none",
            }}>
            {label}
          </button>
        ))}
      </div>

      {tab === "apply"    && <ApplyTab staff={staff} inputCls={inputCls} inputStyle={inputStyle} />}
      {tab === "records"  && <RecordsTab />}
      {tab === "info"     && <InfoTab staff={staff} />}
      {tab === "free"     && <FreeSlotsPanel staff={staff} />}
      {tab === "settings" && <SettingsTab inputCls={inputCls} inputStyle={inputStyle} />}
    </div>
  )
}

// ─── 板面 1：申請 ────────────────────────────────────────────
function ApplyTab({ staff, inputCls, inputStyle }: {
  staff: Staff[]; inputCls: string; inputStyle: React.CSSProperties
}) {
  const [teacherId, setTeacherId] = useState("")
  const [title,     setTitle]     = useState("")
  const [organiser, setOrganiser] = useState("")
  const [multiDay,  setMultiDay]  = useState(false)
  const [startDate, setStartDate] = useState(todayYmd())
  const [endDate,   setEndDate]   = useState(todayYmd())
  const [startTime, setStartTime] = useState("09:00")
  const [endTime,   setEndTime]   = useState("12:00")

  const [checks,  setChecks]  = useState<Check[] | null>(null)
  const [checkErr, setCheckErr] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [msg,     setMsg]     = useState<string | null>(null)

  // Debounced live check — the whole point of 板面 1.
  useEffect(() => {
    if (!teacherId || !startDate || !startTime || !endTime) { setChecks(null); setCheckErr(null); return }
    setChecking(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/pd/check", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teacherId, startDate, endDate: multiDay ? endDate : startDate, startTime, endTime,
          }),
        })
        const d = await res.json().catch(() => ({}))
        // A failed check is not the same as "no clash". Say which it is.
        if (!res.ok) { setChecks(null); setCheckErr(d?.error ?? `檢查失敗 (${res.status})`) }
        else         { setChecks(d.checks); setCheckErr(null) }
      } catch { setChecks(null); setCheckErr("檢查失敗，請檢查網絡後再試。") }
      setChecking(false)
    }, 400)
    return () => { clearTimeout(t); setChecking(false) }
  }, [teacherId, startDate, endDate, multiDay, startTime, endTime])

  async function save() {
    if (!teacherId || !title.trim()) { setMsg("請填寫教師及進修名稱"); return }
    setSaving(true); setMsg(null)
    const res = await fetch("/api/pd/applications", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teacherId, title: title.trim(), organiser: organiser.trim() || undefined,
        startDate, endDate: multiDay ? endDate : startDate, startTime, endTime,
      }),
    })
    setSaving(false)
    if (res.ok) { setMsg("已儲存，可到「紀錄」批核。"); setTitle(""); setOrganiser("") }
    else { const d = await res.json().catch(() => ({})); setMsg(d?.error ?? "儲存失敗") }
  }

  return (
    <div className="card p-5 space-y-4">
      <div>
        <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>教師 *</label>
        <StaffPicker staff={staff} selectedId={teacherId} onSelect={setTeacherId} placeholder="搜尋教師姓名…" />
        <TeacherCard teacherId={teacherId} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>進修名稱 *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} style={inputStyle} />
        </div>
        <div>
          <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>主辦機構（選填）</label>
          <input value={organiser} onChange={(e) => setOrganiser(e.target.value)} className={inputCls} style={inputStyle} />
        </div>
      </div>

      <label className="flex items-center gap-2 text-caption" style={{ color: "var(--color-ink-700)" }}>
        <input type="checkbox" checked={multiDay} onChange={(e) => setMultiDay(e.target.checked)} />
        多日進修（日期範圍）
      </label>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>{multiDay ? "開始日期" : "日期"} *</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} style={inputStyle} />
        </div>
        {multiDay && (
          <div>
            <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>結束日期 *</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} style={inputStyle} />
          </div>
        )}
        <div>
          <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>開始時間 *</label>
          <select value={startTime} onChange={(e) => setStartTime(e.target.value)} className={inputCls} style={inputStyle}>
            {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>完結時間 *</label>
          <select value={endTime} onChange={(e) => setEndTime(e.target.value)} className={inputCls} style={inputStyle}>
            {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Live result */}
      {teacherId && (
        <div className="rounded-input p-3" style={{ background: "var(--color-surface-2)" }}>
          {checking ? (
            <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>檢查中…</p>
          ) : checkErr ? (
            <p className="text-caption" style={{ color: "var(--color-discipline)" }}>⚠ {checkErr}</p>
          ) : !checks ? (
            <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>請填寫日期及時間</p>
          ) : (
            <ul className="space-y-1.5">
              {checks.map((c) => <li key={c.date}><CheckLine c={c} /></li>)}
            </ul>
          )}
        </div>
      )}

      <SuggestPanel
        startDate={startDate} endDate={multiDay ? endDate : startDate}
        startTime={startTime} endTime={endTime}
        selectedId={teacherId} onPick={setTeacherId}
        inputCls={inputCls} inputStyle={inputStyle} />

      {msg && <p className="text-caption" style={{ color: "var(--color-ink-500)" }}>{msg}</p>}

      <div className="flex justify-end">
        <button onClick={save} disabled={saving}
          className="px-4 py-2 text-body font-medium rounded-input text-white"
          style={{ background: "var(--color-admin)", opacity: saving ? 0.7 : 1 }}>
          {saving ? "儲存中…" : "儲存申請"}
        </button>
      </div>
    </div>
  )
}

function CheckLine({ c }: { c: Check }) {
  if (c.kind === "clear") {
    return <span className="text-caption" style={{ color: "var(--color-curriculum)" }}>
      ✓ {c.date}　冇衝突（{c.reason}）
    </span>
  }
  if (c.kind === "clash") {
    return <span className="text-caption" style={{ color: "var(--color-discipline)" }}>
      ✕ {c.date}　有衝突：{c.lessons.join("、")}
    </span>
  }
  if (c.kind === "no-data") {
    // Never shown as "冇衝突" — an unmatched name means we simply don't know.
    return <span className="text-caption" style={{ color: "var(--color-admin)" }}>
      ⚠ {c.date}　找不到「{c.teacherName}」的時間表，未能檢查（
      <Link href="/teacher/admin/teachers" className="underline">教師資料</Link>
      　可設定「時間表姓名」）
    </span>
  }
  return <span className="text-caption" style={{ color: "var(--color-admin)" }}>
    ⚠ {c.date}　尚未設定節次時間，未能檢查（請先到「設定」填寫）
  </span>
}

// ─── 紀錄 ────────────────────────────────────────────────────
function RecordsTab() {
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch("/api/pd/applications")
    if (res.ok) setApps((await res.json()).applications ?? [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function review(id: string, action: "approve" | "reject", ack = false) {
    let reason: string | undefined
    if (action === "reject") {
      const r = window.prompt("退回原因（會通知教師）：")
      if (!r?.trim()) return
      reason = r.trim()
    }
    const res = await fetch(`/api/pd/applications/${id}/review`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, rejectionReason: reason, acknowledgeClash: ack }),
    })
    const d = await res.json().catch(() => ({}))

    if (res.status === 409 && d?.needsAcknowledge) {
      const detail = (d.checks ?? [])
        .filter((c: Check) => c.kind !== "clear")
        .map((c: Check) => c.kind === "clash" ? `${c.date}：${c.lessons.join("、")}` : `${c.date}：未能檢查`)
        .join("\n")
      if (confirm(`此申請有以下問題：\n\n${detail}\n\n仍要批核嗎？（會記錄為「衝突下批核」）`)) {
        return review(id, "approve", true)
      }
      return
    }
    if (!res.ok) { window.alert(d?.error ?? "操作失敗"); return }
    load()
  }

  async function remove(id: string) {
    if (!confirm("確定刪除此申請？")) return
    const res = await fetch(`/api/pd/applications/${id}`, { method: "DELETE" })
    if (res.ok) load()
  }

  if (loading) return <p className="text-body text-center py-12" style={{ color: "var(--color-ink-300)" }}>載入中…</p>
  if (apps.length === 0) return <div className="card p-10 text-center text-body" style={{ color: "var(--color-ink-300)" }}>暫無進修申請</div>

  return (
    <ul className="space-y-2">
      {apps.map((a) => (
        <li key={a.id} className="card p-4">
          <div className="flex items-start gap-2 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>{a.title}</span>
                <span className="text-caption px-2 py-0.5 rounded-pill"
                  style={{ background: STATUS[a.status].color + "20", color: STATUS[a.status].color }}>
                  {STATUS[a.status].label}
                </span>
                {a.approvedWithClash && (
                  <span className="text-caption px-2 py-0.5 rounded-pill"
                    style={{ background: "var(--color-discipline)20", color: "var(--color-discipline)" }}>
                    衝突下批核
                  </span>
                )}
              </div>
              <p className="text-caption" style={{ color: "var(--color-ink-500)" }}>
                {a.teacherName}　{a.startDate.slice(0, 10)}
                {a.endDate.slice(0, 10) !== a.startDate.slice(0, 10) && ` – ${a.endDate.slice(0, 10)}`}
                　{a.startTime}–{a.endTime}
                {a.organiser && `　${a.organiser}`}
              </p>
              {a.clashSummary && (
                <pre className="text-[11px] mt-1 whitespace-pre-wrap" style={{ color: "var(--color-ink-400)", fontFamily: "inherit" }}>
                  {a.clashSummary}
                </pre>
              )}
              {a.rejectionReason && (
                <p className="text-caption mt-1" style={{ color: "var(--color-discipline)" }}>退回原因：{a.rejectionReason}</p>
              )}
            </div>
            <div className="flex gap-2 shrink-0">
              {a.status === "PENDING" && (
                <>
                  <button onClick={() => review(a.id, "approve")}
                    className="text-caption font-medium px-3 py-1.5 rounded-input text-white"
                    style={{ background: "var(--color-curriculum)" }}>批核</button>
                  <button onClick={() => review(a.id, "reject")}
                    className="text-caption font-medium px-3 py-1.5 rounded-input"
                    style={{ color: "var(--color-discipline)" }}>退回</button>
                </>
              )}
              <button onClick={() => remove(a.id)} className="text-caption" style={{ color: "var(--color-ink-400)" }}>刪除</button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

// ─── 板面 2：資料 ────────────────────────────────────────────
function InfoTab({ staff }: { staff: Staff[] }) {
  const [teacherId, setTeacherId] = useState("")
  const [data, setData] = useState<{ term: string | null; matched: string | null; lessons: any[]; periods: Period[]; profile?: Profile } | null>(null)
  const [docs, setDocs] = useState<DocLink[]>([])
  const [openDoc, setOpenDoc] = useState<DocLink | null>(null)

  useEffect(() => {
    fetch("/api/pd/settings").then((r) => r.ok ? r.json() : { docs: [] }).then((d) => setDocs(d.docs ?? []))
  }, [])

  useEffect(() => {
    if (!teacherId) { setData(null); return }
    fetch(`/api/pd/timetable?teacherId=${teacherId}`).then((r) => r.ok ? r.json() : null).then(setData)
  }, [teacherId])

  const maxPeriod = useMemo(
    () => Math.max(10, ...(data?.lessons ?? []).map((l: any) => l.period || 0)), [data])

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <h3 className="text-h3 mb-2">教師上課表</h3>
        <StaffPicker staff={staff} selectedId={teacherId} onSelect={setTeacherId} placeholder="搜尋教師姓名…" />
        {data?.profile && <ProfileCard p={data.profile} matched={data.matched} term={data.term} />}

        {data && (
          data.matched ? (
            <div className="overflow-x-auto mt-4">
              <p className="text-caption mb-2" style={{ color: "var(--color-ink-400)" }}>
                {data.matched}　學期 {data.term}
              </p>
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="bg-gray-700 text-white text-xs px-2 py-2">節次</th>
                    {DAYS.slice(1).map((d) => (
                      <th key={d} className="bg-gray-700 text-white text-xs px-2 py-2">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Named slots (周會) sit outside the numbered grid, so give
                      them their own row rather than dropping them. */}
                  {[...Array.from({ length: maxPeriod }, (_, i) => i + 1), 0].map((p) => {
                    const row = (data.lessons ?? []).filter((l: any) => l.period === p)
                    if (p === 0 && row.length === 0) return null
                    const time = data.periods.find((x) => x.period === p)
                    return (
                      <tr key={p} className={p % 2 === 0 ? "bg-gray-50" : "bg-white"}>
                        <td className="px-2 py-1.5 text-xs text-center" style={{ color: "var(--color-ink-500)" }}>
                          {p === 0 ? "其他" : `第${p}節`}
                          {time && <span className="block text-[10px]" style={{ color: "var(--color-ink-300)" }}>{time.startTime}–{time.endTime}</span>}
                        </td>
                        {[1, 2, 3, 4, 5].map((d) => {
                          const cell = row.filter((l: any) => l.dayOfWeek === d)
                          return (
                            <td key={d} className="px-2 py-1.5 text-xs text-center" style={{ color: "var(--color-ink-900)" }}>
                              {cell.map((l: any, i: number) => (
                                <span key={i} className="block">
                                  {l.periodLabel ? `${l.periodLabel} ` : ""}{l.classCode ?? ""} {l.subject ?? ""}
                                </span>
                              ))}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-caption mt-3" style={{ color: "var(--color-admin)" }}>
              ⚠ 時間表未有此教師的紀錄{data.term ? `（學期 ${data.term}）` : "（尚未上載時間表）"}。
              請確認 CSV 已上載，且姓名與系統帳戶一致。
            </p>
          )
        )}
      </div>

      <div className="card p-5">
        <h3 className="text-h3 mb-2">行政文件</h3>
        {docs.length === 0 ? (
          <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>
            尚未設定文件連結，請到「設定」加入（校曆表、委員會、教師名單）。
          </p>
        ) : (
          <>
            <div className="flex gap-2 flex-wrap">
              {docs.map((d) => (
                <button key={d.label} onClick={() => setOpenDoc(openDoc?.label === d.label ? null : d)}
                  className="text-caption font-medium px-3 py-1.5 rounded-input border"
                  style={{
                    border: `1px solid ${openDoc?.label === d.label ? "var(--color-admin)" : "var(--color-border)"}`,
                    color: "var(--color-ink-700)",
                  }}>
                  {d.label}
                </button>
              ))}
            </div>
            {openDoc && (
              <div className="mt-3">
                <a href={openDoc.url} target="_blank" rel="noreferrer"
                  className="text-caption" style={{ color: "var(--color-accent)" }}>
                  在新視窗開啟 ↗
                </a>
                <iframe src={openDoc.url} className="w-full mt-2 rounded-input border"
                  style={{ height: 520, borderColor: "var(--color-border)" }} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── 設定 ────────────────────────────────────────────────────
function SettingsTab({ inputCls, inputStyle }: { inputCls: string; inputStyle: React.CSSProperties }) {
  const [periods, setPeriods] = useState<Period[]>([])
  const [nt, setNt]           = useState<NonTeaching[]>([])
  const [docs, setDocs]       = useState<DocLink[]>([])
  const [msg, setMsg]         = useState<string | null>(null)
  const [saving, setSaving]   = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)

  // Pull 學校活動及假期 events in as *candidate* 假期 rows. They are only
  // appended to the editable list — nothing is written until 儲存設定 — because
  // not every SCHOOL event is a non-teaching day (陸運會, 家長日…).
  async function importHolidays(all: boolean) {
    setImporting(true); setImportMsg(null)
    const res = await fetch("/api/pd/settings/calendar-holidays")
    if (!res.ok) {
      setImporting(false)
      setImportMsg(`匯入失敗 (${res.status})`)
      return
    }
    const { candidates } = await res.json() as {
      candidates: (NonTeaching & { likely: boolean })[]
    }
    const picked = candidates.filter((c) => all || c.likely)
    let added = 0
    setNt((prev) => {
      const seen = new Set(prev.map((x) => `${x.name}|${x.startDate}`))
      const fresh = picked
        .filter((c) => !seen.has(`${c.name}|${c.startDate}`))
        .map(({ name, type, startDate, endDate, freeFrom }) => ({ name, type, startDate, endDate, freeFrom }))
      added = fresh.length
      return [...prev, ...fresh]
    })
    setImporting(false)
    setImportMsg(added === 0
      ? "冇新的日期可匯入。"
      : `已加入 ${added} 項，請檢查後按「儲存設定」。`)
  }

  useEffect(() => {
    fetch("/api/pd/settings").then((r) => r.ok ? r.json() : null).then((d) => {
      if (!d) return
      setPeriods(d.periods?.length
        ? d.periods.map((p: any) => ({ period: p.period ?? null, label: p.label ?? null, startTime: p.startTime, endTime: p.endTime }))
        : Array.from({ length: 10 }, (_, i) => ({ period: i + 1, label: null, startTime: "", endTime: "" })))
      setNt((d.nonTeaching ?? []).map((x: any) => ({
        name: x.name, type: x.type, freeFrom: x.freeFrom,
        startDate: String(x.startDate).slice(0, 10), endDate: String(x.endDate).slice(0, 10),
      })))
      setDocs(d.docs ?? [])
    })
  }, [])

  async function save() {
    setSaving(true); setMsg(null)
    const res = await fetch("/api/pd/settings", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        periods: periods.filter((p) => p.startTime && p.endTime && (p.period !== null || p.label?.trim())),
        nonTeaching: nt.filter((n) => n.name && n.startDate && n.endDate),
        docs: docs.filter((d) => d.label && d.url),
      }),
    })
    setSaving(false)
    const d = await res.json().catch(() => ({}))
    setMsg(res.ok ? "已儲存" : (d?.error ?? "儲存失敗"))
  }

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="text-h3">節次時間</h3>
          <button onClick={() => setPeriods(DEFAULT_PERIODS.map((p) => ({ ...p })))}
            className="text-caption font-medium shrink-0" style={{ color: "var(--color-admin)" }}>
            使用預設時間
          </button>
        </div>
        <p className="text-caption mb-3" style={{ color: "var(--color-ink-400)" }}>
          時間表只記錄「第幾節」，必須填上實際時間，衝突檢查先可以運作。留空的節次會被略過。
          早會、周會等有名無節數的時段，喺「名稱」欄填上時間表上的寫法（例如 周會）。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {periods.map((p, i) => (
            <div key={i} className="flex items-center gap-2">
              {p.period !== null ? (
                <span className="text-caption w-16 shrink-0" style={{ color: "var(--color-ink-500)" }}>第{p.period}節</span>
              ) : (
                <input placeholder="名稱" value={p.label ?? ""} className={inputCls} style={{ ...inputStyle, width: 64 }}
                  onChange={(e) => setPeriods((prev) => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
              )}
              <input type="time" value={p.startTime} className={inputCls} style={inputStyle}
                onChange={(e) => setPeriods((prev) => prev.map((x, j) => j === i ? { ...x, startTime: e.target.value } : x))} />
              <input type="time" value={p.endTime} className={inputCls} style={inputStyle}
                onChange={(e) => setPeriods((prev) => prev.map((x, j) => j === i ? { ...x, endTime: e.target.value } : x))} />
              {p.period === null && (
                <button onClick={() => setPeriods((prev) => prev.filter((_, j) => j !== i))}
                  className="text-caption shrink-0" style={{ color: "var(--color-discipline)" }}>✕</button>
              )}
            </div>
          ))}
        </div>
        <button onClick={() => setPeriods((prev) => [...prev, { period: null, label: "", startTime: "", endTime: "" }])}
          className="text-caption font-medium mt-2" style={{ color: "var(--color-admin)" }}>+ 新增特別時段</button>
      </div>

      <div className="card p-5">
        <h3 className="text-h3 mb-1">假期／考試期</h3>
        <p className="text-caption mb-2" style={{ color: "var(--color-ink-400)" }}>
          假期＝全日無課；考試期可設定「幾點後可外出」（例如 13:00）。考試期請自行輸入。
        </p>
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <button onClick={() => importHolidays(false)} disabled={importing}
            className="text-caption font-medium" style={{ color: "var(--color-admin)" }}>
            {importing ? "匯入中…" : "從行事曆匯入假期"}
          </button>
          <button onClick={() => importHolidays(true)} disabled={importing}
            className="text-caption" style={{ color: "var(--color-ink-400)" }}>
            匯入全部學校活動及假期
          </button>
          {importMsg && <span className="text-caption" style={{ color: "var(--color-ink-500)" }}>{importMsg}</span>}
        </div>
        <div className="space-y-2">
          {nt.map((n, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-center">
              <input placeholder="名稱（如 暑假）" value={n.name} className={inputCls} style={inputStyle}
                onChange={(e) => setNt((p) => p.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
              <select value={n.type} className={inputCls} style={inputStyle}
                onChange={(e) => setNt((p) => p.map((x, j) => j === i ? { ...x, type: e.target.value as "HOLIDAY" | "EXAM" } : x))}>
                <option value="HOLIDAY">假期</option>
                <option value="EXAM">考試期</option>
              </select>
              <input type="date" value={n.startDate} className={inputCls} style={inputStyle}
                onChange={(e) => setNt((p) => p.map((x, j) => j === i ? { ...x, startDate: e.target.value } : x))} />
              <input type="date" value={n.endDate} className={inputCls} style={inputStyle}
                onChange={(e) => setNt((p) => p.map((x, j) => j === i ? { ...x, endDate: e.target.value } : x))} />
              <div className="flex items-center gap-1">
                <input type="time" disabled={n.type !== "EXAM"} value={n.freeFrom ?? ""} className={inputCls} style={inputStyle}
                  onChange={(e) => setNt((p) => p.map((x, j) => j === i ? { ...x, freeFrom: e.target.value } : x))} />
                <button onClick={() => setNt((p) => p.filter((_, j) => j !== i))}
                  className="text-caption shrink-0" style={{ color: "var(--color-discipline)" }}>✕</button>
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => setNt((p) => [...p, { name: "", type: "HOLIDAY", startDate: "", endDate: "", freeFrom: null }])}
          className="text-caption font-medium mt-2" style={{ color: "var(--color-admin)" }}>+ 新增</button>
      </div>

      <div className="card p-5">
        <h3 className="text-h3 mb-1">行政文件連結</h3>
        <p className="text-caption mb-3" style={{ color: "var(--color-ink-400)" }}>
          貼上 Google Drive 連結（校曆表(教師版)、委員會、教師名單）。如要在頁內顯示，請用 Drive 的 /preview 連結。
        </p>
        <div className="space-y-2">
          {docs.map((d, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input placeholder="名稱" value={d.label} className={inputCls} style={{ ...inputStyle, maxWidth: 180 }}
                onChange={(e) => setDocs((p) => p.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
              <input placeholder="https://drive.google.com/…/preview" value={d.url} className={inputCls} style={inputStyle}
                onChange={(e) => setDocs((p) => p.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} />
              <button onClick={() => setDocs((p) => p.filter((_, j) => j !== i))}
                className="text-caption shrink-0" style={{ color: "var(--color-discipline)" }}>✕</button>
            </div>
          ))}
        </div>
        <button onClick={() => setDocs((p) => [...p, { label: "", url: "" }])}
          className="text-caption font-medium mt-2" style={{ color: "var(--color-admin)" }}>+ 新增</button>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="px-4 py-2 text-body font-medium rounded-input text-white"
          style={{ background: "var(--color-admin)", opacity: saving ? 0.7 : 1 }}>
          {saving ? "儲存中…" : "儲存設定"}
        </button>
        {msg && <span className="text-caption" style={{ color: "var(--color-ink-500)" }}>{msg}</span>}
      </div>
    </div>
  )
}

// 教師資料卡 — who this teacher is, beyond the name on the picker.
//
// The 時間表 line is here on purpose: an unresolved name is the one thing that
// silently makes the whole clash check meaningless, and this puts it in front
// of you at the moment you pick someone rather than after you file.
function TeacherCard({ teacherId }: { teacherId: string }) {
  const [data, setData] = useState<{ matched: string | null; term: string | null; profile?: Profile } | null>(null)

  useEffect(() => {
    if (!teacherId) { setData(null); return }
    let cancelled = false
    fetch(`/api/pd/timetable?teacherId=${teacherId}`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (!cancelled) setData(d) })
    return () => { cancelled = true }
  }, [teacherId])

  if (!data?.profile) return null
  return <ProfileCard p={data.profile} matched={data.matched} term={data.term} />
}

function Chips({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex items-baseline gap-2 flex-wrap">
      <span className="text-caption shrink-0" style={{ color: "var(--color-ink-400)" }}>{label}</span>
      {items.length === 0 ? (
        <span className="text-caption" style={{ color: "var(--color-ink-300)" }}>未填寫</span>
      ) : items.map((x) => (
        <span key={x} className="text-caption px-1.5 py-0.5 rounded-pill"
          style={{ background: "var(--color-surface-2)", color: "var(--color-ink-600)" }}>{x}</span>
      ))}
    </div>
  )
}

function ProfileCard({ p, matched, term }: { p: Profile; matched: string | null; term: string | null }) {
  return (
    <div className="mt-2 p-3 rounded-input space-y-1.5" style={{ background: "var(--color-surface-2)" }}>
      <Chips label="科組" items={p.departments} />
      <Chips label="委員會" items={p.committees} />
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>時間表</span>
        {matched ? (
          <span className="text-caption" style={{ color: "var(--color-curriculum)" }}>
            ✓ {matched}{term ? `（學期 ${term}）` : ""}
          </span>
        ) : (
          <span className="text-caption" style={{ color: "var(--color-admin)" }}>
            ⚠ 找不到　
            <Link href="/teacher/admin/teachers" className="underline">教師資料</Link>
          </span>
        )}
        <span className="text-caption" style={{ color: "var(--color-ink-400)" }}>
          本學年已申請 {p.pdCount} 次
        </span>
      </div>
      {(p.departments.length === 0 && p.committees.length === 0) && (
        <p className="text-caption" style={{ color: "var(--color-ink-300)" }}>
          科組及委員會可喺 <Link href="/teacher/admin/teachers" className="underline">教師資料</Link> 填寫。
        </p>
      )}
    </div>
  )
}

// ─── 建議人選 ────────────────────────────────────────────────
type Candidate = {
  id: string; name: string | null; nameEn: string | null; email: string | null
  subjects: string[]; committees: string[]
  resolved: string | null; clashDates: number; lessons: string[]
  notConfigured: boolean; pdCount: number
}
type Suggestion = {
  dates: string[]; notConfigured: boolean; term: string | null
  free: Candidate[]; partial: Candidate[]; unknown: Candidate[]
  missingProfile: number; total: number
}

/**
 * Turns the 申請 question round: instead of "is this teacher free?", "who is
 * free?" — filtered by 科組 or 委員會. It only suggests; picking a row just
 * fills the form above, and the application is still filed and approved the
 * normal way.
 */
function SuggestPanel({ startDate, endDate, startTime, endTime, selectedId, onPick, inputCls, inputStyle }: {
  startDate: string; endDate: string; startTime: string; endTime: string
  selectedId: string; onPick: (id: string) => void
  inputCls: string; inputStyle: React.CSSProperties
}) {
  const [open,    setOpen]    = useState(false)
  const [dept,    setDept]    = useState("")
  const [cmte,    setCmte]    = useState("")
  const [data,    setData]    = useState<Suggestion | null>(null)
  const [loading, setLoading] = useState(false)
  const [err,     setErr]     = useState<string | null>(null)

  const search = useCallback(async () => {
    if (!startDate || !startTime || !endTime) return
    setLoading(true); setErr(null)
    try {
      const res = await fetch("/api/pd/suggest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate, endDate, startTime, endTime, department: dept || undefined, committee: cmte || undefined }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d?.error ?? `搜尋失敗 (${res.status})`); setData(null) }
      else setData(d)
    } catch { setErr("搜尋失敗，請重試。") }
    setLoading(false)
  }, [startDate, endDate, startTime, endTime, dept, cmte])

  // Re-run when the window or filter changes, but only while the panel is open.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(search, 300)
    return () => clearTimeout(t)
  }, [open, search])

  return (
    <div className="rounded-input" style={{ border: "1px solid var(--color-border)" }}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-caption font-medium"
        style={{ color: "var(--color-admin)" }}>
        <span>建議人選（邊位喺呢個時段冇課）</span>
        <span style={{ color: "var(--color-ink-300)" }}>{open ? "收起" : "展開"}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select value={dept} onChange={(e) => setDept(e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">所有科組</option>
              {SUBJECTS.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <select value={cmte} onChange={(e) => setCmte(e.target.value)} className={inputCls} style={inputStyle}>
              <option value="">所有委員會</option>
              {COMMITTEES.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>

          {err && <p className="text-caption" style={{ color: "var(--color-discipline)" }}>{err}</p>}
          {loading && <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>搜尋中…</p>}

          {data && !loading && (
            <>
              {data.notConfigured ? (
                <p className="text-caption" style={{ color: "var(--color-admin)" }}>
                  ⚠ 尚未設定節次時間，未能檢查（請先到「設定」填寫）。
                </p>
              ) : (
                <>
                  <Bucket title="全程冇課" tone="var(--color-curriculum)" items={data.free}
                    selectedId={selectedId} onPick={onPick} />
                  <Bucket title="部分時間有課" tone="var(--color-discipline)" items={data.partial}
                    selectedId={selectedId} onPick={onPick} showLessons />
                  {data.unknown.length > 0 && (
                    <Bucket title="未能確認（找不到時間表）" tone="var(--color-admin)" items={data.unknown}
                      selectedId={selectedId} onPick={onPick} />
                  )}
                </>
              )}

              {(dept || cmte) && data.missingProfile > 0 && (
                <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>
                  有 {data.missingProfile} 位教師未填科組／委員會，可能未列入篩選結果 —{" "}
                  <Link href="/teacher/admin/teachers" className="underline">教師資料</Link>
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Bucket({ title, tone, items, selectedId, onPick, showLessons }: {
  title: string; tone: string; items: Candidate[]
  selectedId: string; onPick: (id: string) => void; showLessons?: boolean
}) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="text-caption font-medium mb-1" style={{ color: tone }}>{title}（{items.length}）</p>
      <div className="space-y-1">
        {items.slice(0, 30).map((c) => (
          <button key={c.id} type="button" onClick={() => onPick(c.id)}
            className="w-full text-left px-2 py-1.5 rounded-input flex items-baseline gap-2 flex-wrap hover:bg-[var(--color-surface-2)]"
            style={{ background: selectedId === c.id ? "var(--color-surface-2)" : "transparent" }}>
            <span className="text-body" style={{ color: "var(--color-ink-900)" }}>{c.name ?? c.email}</span>
            {c.subjects.slice(0, 3).map((x) => (
              <span key={x} className="text-caption px-1.5 py-0.5 rounded-pill"
                style={{ background: "var(--color-surface-2)", color: "var(--color-ink-500)" }}>{x}</span>
            ))}
            <span className="text-caption ml-auto shrink-0" style={{ color: "var(--color-ink-400)" }}>
              本學年 {c.pdCount} 次
            </span>
            {showLessons && c.lessons.length > 0 && (
              <span className="w-full text-caption" style={{ color: "var(--color-ink-400)" }}>
                {c.lessons.slice(0, 3).join("、")}{c.lessons.length > 3 ? ` …另有 ${c.lessons.length - 3} 節` : ""}
              </span>
            )}
          </button>
        ))}
        {items.length > 30 && (
          <p className="text-caption px-2" style={{ color: "var(--color-ink-300)" }}>…另有 {items.length - 30} 位</p>
        )}
      </div>
    </div>
  )
}

