"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import Link from "next/link"
import { Download, Loader2, Plus, X, ChevronDown, ChevronUp, CalendarDays, Users } from "lucide-react"

// ─── Types ───────────────────────────────────────────────

interface Session {
  id: number
  date: string
  time: string
  location: string
  activityName: string // T2 only
  arriveTime: string
  leaveTime: string
}

interface Student {
  id: number
  className: string
  studentId: string
  name: string
}

// ─── Chinese date helpers (for preview) ──────────────────

const CN = ["","一","二","三","四","五","六","七","八","九","十"]
const MONTHS = ["一","二","三","四","五","六","七","八","九","十","十一","十二"]
const WEEKDAYS = ["星期日","星期一","星期二","星期三","星期四","星期五","星期六"]
const MONTHS_ZH = ["一月","二月","三月","四月","五月","六月","七月","八月","九月","十月","十一月","十二月"]

function dayToChinese(d: number): string {
  if (d <= 10) return CN[d]
  const t = Math.floor(d / 10), o = d % 10
  return (t > 1 ? CN[t] : "") + "十" + (o ? CN[o] : "")
}
function numToChineseDate(s: string): string {
  if (!s) return ""
  const [y, m, d] = s.split("-").map(Number)
  if (!y || !m || !d) return s
  const yr = String(y).split("").map(c => CN[+c] ?? "零").join("")
  return `${yr}年${MONTHS[m-1]}月${dayToChinese(d)}日`
}
function dateWithWeekday(s: string): string {
  if (!s) return ""
  const [y, m, d] = s.split("-").map(Number)
  if (!y || !m || !d) return s
  return `${y}年${m}月${d}日（${WEEKDAYS[new Date(y, m-1, d).getDay()]}）`
}
function esc(s: string): string {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
}
function fmtDMY(s: string): string {
  if (!s) return ""
  const [y, m, d] = s.split("-").map(Number)
  return `${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}/${y}`
}

// ─── Body templates ───────────────────────────────────────

const BODY_TEMPLATES = [
  "貴子女日前申請參與下列課外活動，經已獲准，請督促\u3000貴子女按時出席該項活動，活動資料詳列於下，敬希細閱並簽妥回條，以便遵照辦理。",
  "貴子弟將代表本校出席下列比賽活動，請督促\u3000貴子女積極備賽並按時出席。活動詳情如下，敬希細閱並簽妥回條，以便遵照辦理。",
  "貴子弟早前參與本校舉辦之交流活動，現有嘉賓回訪本校並舉辦下列活動，藉此讓學生深化交流、提升視野。活動詳情如下，敬希細閱並簽妥回條，以便遵照辦理。",
  "為提升\u3000貴子女在相關範疇之技能與知識，本校將舉辦下列工作坊，誠邀\u3000貴子女踴躍參與。活動詳情如下，敬希細閱並按時出席。",
]

const FAD8_CATEGORIES = [
  { value: "1", label: "1. 校外獎項及重要參與" },
  { value: "2", label: "2. 德育及公民教育" },
  { value: "3", label: "3. 校內及社會服務" },
  { value: "4", label: "4. 體育發展" },
  { value: "5", label: "5. 藝術發展" },
  { value: "6", label: "6. 與工作有關的經驗" },
]
const FAD8_ACHIEVEMENTS = [
  "冠軍/亞軍/季軍/優異獎",
  "積極參與/表現投入",
  "取得證書",
  "學校代表",
  "熱心服務",
]

// ─── Batch Calendar Modal ─────────────────────────────────

function BatchCalendarModal({
  onConfirm,
  onClose,
  lastDate,
}: { onConfirm: (dates: string[]) => void; onClose: () => void; lastDate?: string }) {
  const now = lastDate ? new Date(lastDate + "T00:00:00") : new Date()
  const [calYear, setCalYear] = useState(now.getFullYear())
  const [calMonth, setCalMonth] = useState(now.getMonth())
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const todayStr = (() => {
    const t = new Date()
    return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`
  })()

  const firstDow = (new Date(calYear, calMonth, 1).getDay() + 6) % 7 // Mon=0
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()

  function toggle(ds: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(ds) ? next.delete(ds) : next.add(ds)
      return next
    })
  }
  function prevMonth() {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11) }
    else setCalMonth(m => m - 1)
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0) }
    else setCalMonth(m => m + 1)
  }

  const sorted = Array.from(selected).sort()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-80 max-w-[95vw]">
        <div className="flex items-center justify-between mb-3">
          <button onClick={prevMonth} className="w-8 h-8 flex items-center justify-center border rounded-lg hover:bg-gray-50 text-sm">◀</button>
          <span className="font-bold text-sm" style={{ color: "var(--color-admin)" }}>{calYear}年{MONTHS_ZH[calMonth]}</span>
          <button onClick={nextMonth} className="w-8 h-8 flex items-center justify-center border rounded-lg hover:bg-gray-50 text-sm">▶</button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 mb-2">
          {["一","二","三","四","五","六","日"].map(d => (
            <div key={d} className="text-center text-[10px] font-bold text-gray-400 py-1">{d}</div>
          ))}
          {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d = i + 1
            const ds = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`
            const isSel = selected.has(ds)
            const isToday = ds === todayStr
            return (
              <button
                key={ds}
                onClick={() => toggle(ds)}
                className={`text-center text-xs py-1.5 rounded-md transition-colors ${
                  isSel ? "text-white font-bold" : "hover:bg-gray-100"
                } ${isToday && !isSel ? "outline outline-2 outline-offset-[-2px]" : ""}`}
                style={{
                  background: isSel ? "var(--color-admin)" : undefined,
                  outlineColor: isToday && !isSel ? "var(--color-admin)" : undefined,
                }}
              >{d}</button>
            )
          })}
        </div>
        <div className="min-h-10 bg-gray-50 border rounded-lg p-2 text-[11px] text-gray-500 mb-2 max-h-28 overflow-y-auto leading-6">
          {sorted.length === 0 ? "（未選擇任何日期）" : sorted.map(ds => {
            const [y,m,d] = ds.split("-").map(Number)
            return `${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}/${y}（${WEEKDAYS[new Date(y,m-1,d).getDay()]}）`
          }).join("　")}
        </div>
        {sorted.length > 0 && <p className="text-[11px] text-gray-400 mb-2">已選 {sorted.length} 個日期</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">取消</button>
          <button
            onClick={() => { onConfirm(sorted); onClose() }}
            className="px-4 py-2 text-sm font-bold text-white rounded-lg"
            style={{ background: "var(--color-admin)" }}
          >確認新增</button>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────

export default function ActivityDocsPage() {
  const today = new Date().toISOString().split("T")[0]

  // Basic info
  const [activityName, setActivityName] = useState("")
  const [noticeNum, setNoticeNum]       = useState("")
  const [issueDate, setIssueDate]       = useState(today)
  const [teacher, setTeacher]           = useState("")
  const [contactTel, setContactTel]     = useState("2342-2954")
  const [tutorType, setTutorType]       = useState<"school"|"external">("school")
  const [orgName, setOrgName]           = useState("")

  // Sessions
  const [noticeType, setNoticeType] = useState<"1"|"2">("1")
  const [sessions, setSessions]     = useState<Session[]>([{ id: 1, date: "", time: "", location: "", activityName: "", arriveTime: "", leaveTime: "" }])
  const nextSessId = useRef(2)

  // T2 shared arrive/leave
  const [t2Arrive, setT2Arrive] = useState("")
  const [t2Leave, setT2Leave]   = useState("")

  // Body text
  const [bodyText, setBodyText]       = useState(BODY_TEMPLATES[0])
  const [bodyChipIdx, setBodyChipIdx] = useState(0)

  // Preview
  const [previewOpen, setPreviewOpen] = useState(false)

  // Students
  const [students, setStudents] = useState<Student[]>([])
  const nextStudId = useRef(1)
  const studentTableRef = useRef<HTMLTableElement>(null)

  // FAD8
  const [fad8Category,    setFad8Category]    = useState("1")
  const [fad8Achievement, setFad8Achievement] = useState("積極參與/表現投入")
  const [dept, setDept]                       = useState("電腦科")

  // Batch modal
  const [showBatchModal, setShowBatchModal] = useState(false)

  // Loading
  const [generating, setGenerating] = useState(false)
  const [error, setError]           = useState("")

  // ── Session helpers ───────────────────────────────────

  function addSession(date?: string) {
    const lastSess = sessions[sessions.length - 1]
    let nextDate = date
    if (!nextDate && lastSess?.date) {
      const d = new Date(lastSess.date + "T00:00:00")
      d.setDate(d.getDate() + 7)
      nextDate = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`
    }
    const id = nextSessId.current++
    setSessions(prev => [...prev, {
      id,
      date: nextDate ?? "",
      time: lastSess?.time ?? "",
      location: lastSess?.location ?? "",
      activityName: "",
      arriveTime: lastSess?.arriveTime ?? "",
      leaveTime: lastSess?.leaveTime ?? "",
    }])
  }
  function removeSession(id: number) {
    setSessions(prev => prev.filter(s => s.id !== id))
  }
  function updateSession(id: number, field: keyof Session, value: string) {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  function handleBatchDates(dates: string[]) {
    setSessions(prev => {
      // Keep existing sessions with dates, add new batch dates
      const existing = prev.filter(s => s.date)
      const existingDates = new Set(existing.map(s => s.date))
      const newDates = dates.filter(d => !existingDates.has(d))
      const firstSess = prev[0]
      const newSessions = newDates.map(d => ({
        id: nextSessId.current++,
        date: d,
        time: firstSess?.time ?? "",
        location: firstSess?.location ?? "",
        activityName: "",
        arriveTime: firstSess?.arriveTime ?? "",
        leaveTime: firstSess?.leaveTime ?? "",
      }))
      return [...prev, ...newSessions].sort((a, b) => a.date.localeCompare(b.date))
    })
  }

  // ── Student helpers ───────────────────────────────────

  function addStudent(cls = "", sid = "", name = "") {
    const id = nextStudId.current++
    setStudents(prev => [...prev, { id, className: cls, studentId: sid, name }])
  }
  function removeStudent(id: number) {
    setStudents(prev => prev.filter(s => s.id !== id))
  }
  function updateStudent(id: number, field: keyof Student, value: string) {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s))
  }

  // Excel paste handler
  function handleTablePaste(e: React.ClipboardEvent<HTMLTableElement>) {
    const target = e.target as HTMLElement
    if (!target.closest("tbody")) return
    e.preventDefault()
    const text = e.clipboardData.getData("text/plain")
    const rows = text.split(/\r?\n/).filter(r => r.trim())
    if (!rows.length) return

    const fields: Array<keyof Student> = ["className", "studentId", "name"]
    const focusTr = (target as HTMLElement).closest("tr")
    const allRows = Array.from(studentTableRef.current?.querySelectorAll("tbody tr") ?? [])
    let startRow = focusTr ? allRows.indexOf(focusTr as HTMLTableRowElement) : students.length
    const inputs = focusTr ? Array.from(focusTr.querySelectorAll("input")) : []
    let startCol = inputs.indexOf(target as HTMLInputElement)
    if (startCol < 0) startCol = 0

    setStudents(prev => {
      const next = [...prev]
      rows.forEach((raw, ri) => {
        const cols = raw.split("\t").map(c => c.trim())
        const rowIdx = startRow + ri
        while (rowIdx >= next.length) {
          next.push({ id: nextStudId.current++, className: "", studentId: "", name: "" })
        }
        cols.forEach((val, ci) => {
          const fieldIdx = startCol + ci
          if (fieldIdx < fields.length) {
            next[rowIdx] = { ...next[rowIdx], [fields[fieldIdx]]: val }
          }
        })
      })
      return next
    })
  }

  // ── Body chip ─────────────────────────────────────────

  function selectBodyChip(idx: number) {
    setBodyChipIdx(idx)
    if (idx < BODY_TEMPLATES.length) setBodyText(BODY_TEMPLATES[idx])
    else setBodyText("")
  }
  function onBodyEdit(val: string) {
    setBodyText(val)
    const knownIdx = BODY_TEMPLATES.indexOf(val)
    setBodyChipIdx(knownIdx >= 0 ? knownIdx : BODY_TEMPLATES.length)
  }

  // ── Build preview HTML ────────────────────────────────

  function buildPreviewHtml(): string {
    const remarks = "如學生因事未能出席是次活動，必須事先通知負責老師<br>活動日期及時間或會因天氣及教育局不時發出的指引有所更改"
    let tableHTML = ""
    if (noticeType === "2") {
      const sA = sessions[0] ?? { date:"", time:"", location:"", activityName:"" }
      const sB = sessions[1] ?? { date:"", time:"", location:"", activityName:"" }
      tableHTML = `
        <tr><td class="lbl">活動名稱</td><td>${esc(sA.activityName||activityName)}</td><td>${esc(sB.activityName||activityName)}</td></tr>
        <tr><td class="lbl">活動日期</td><td>${esc(dateWithWeekday(sA.date))}</td><td>${esc(dateWithWeekday(sB.date))}</td></tr>
        <tr><td class="lbl">活動時間</td><td>${esc(sA.time)}</td><td>${esc(sB.time)}</td></tr>
        <tr><td class="lbl">活動地點</td><td>${esc(sA.location)}</td><td>${esc(sB.location)}</td></tr>
        <tr><td class="lbl">負責老師</td><td>${esc(teacher)}老師</td><td>${esc(teacher)}老師</td></tr>
        <tr><td class="lbl">備　　註</td><td style="font-size:11px;line-height:1.5">${remarks}</td><td style="font-size:11px;line-height:1.5">${remarks}</td></tr>`
    } else {
      const s0 = sessions[0] ?? { date:"", time:"", location:"" }
      let dateCell = ""
      if (sessions.length === 1) {
        dateCell = esc(dateWithWeekday(s0.date))
      } else if (sessions.length > 1) {
        const parts = sessions.map(s => {
          if (!s.date) return ""
          const [y,m,d] = s.date.split("-").map(Number)
          return `${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}/${y}（${WEEKDAYS[new Date(y,m-1,d).getDay()]}）`
        }).filter(Boolean)
        dateCell = esc(parts.join(", "))
      }
      tableHTML = `
        <tr><td class="lbl">活動名稱</td><td>${esc(activityName)}</td></tr>
        <tr><td class="lbl">活動日期</td><td style="font-size:${sessions.length>2?"11.5px":"13px"}">${dateCell}</td></tr>
        <tr><td class="lbl">活動時間</td><td>${esc(s0.time)}</td></tr>
        <tr><td class="lbl">活動地點</td><td>${esc(s0.location)}</td></tr>
        <tr><td class="lbl">負責老師</td><td>${esc(teacher)}老師</td></tr>
        <tr><td class="lbl">備　　註</td><td style="font-size:11px;line-height:1.5">${remarks}</td></tr>`
    }
    return `
      <div style="border-bottom:1px solid #999;padding-bottom:4px;margin-bottom:16px;display:flex;justify-content:space-between;font-size:13px">
        <span>中華基督教會基智中學</span><span>家長通告${esc(noticeNum)}</span>
      </div>
      <div style="text-align:center;font-size:15px;font-weight:700;margin:10px 0 16px">【${esc(activityName||"活動名稱")}】</div>
      <p>敬啟者：</p><br>
      <p>${esc(bodyText)}</p><br>
      <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:12.5px">
        <style>.lbl{background:#f0f0f0;font-weight:700;width:72px;white-space:nowrap;border:1px solid #555;padding:5px 10px;vertical-align:top}td{border:1px solid #555;padding:5px 10px;vertical-align:top}</style>
        ${tableHTML}
      </table><br>
      <p>如有查詢，歡迎致電${esc(contactTel)} 與${esc(teacher||"XXX")}老師聯絡。</p><br>
      <p>此致</p><p>貴家長</p><br>
      <p style="text-align:right">中華基督教會基智中學校長</p><br><br>
      <p style="text-align:right">李淦章博士　謹啟</p>
      <p style="text-align:right">${numToChineseDate(issueDate)}</p>`
  }

  // ── Generate ──────────────────────────────────────────

  async function handleGenerate() {
    if (!activityName.trim() || !teacher.trim() || !issueDate) {
      setError("請填寫活動名稱、負責老師及發出日期。")
      return
    }
    setError("")
    setGenerating(true)
    try {
      const payload = {
        activityName: activityName.trim(),
        noticeNum:    noticeNum.trim(),
        issueDate,
        teacher:      teacher.trim(),
        tutorType,
        orgName:      orgName.trim(),
        contactTel:   contactTel.trim() || "2342-2954",
        bodyText,
        noticeType,
        sessions: noticeType === "2"
          ? sessions.slice(0, 2).map(s => ({
              date:         s.date,
              time:         s.time,
              location:     s.location,
              activityName: s.activityName,
              arriveTime:   t2Arrive,
              leaveTime:    t2Leave,
            }))
          : sessions.map(s => ({
              date:         s.date,
              time:         sessions[0]?.time ?? s.time,
              location:     sessions[0]?.location ?? s.location,
              activityName: "",
              arriveTime:   s.arriveTime,
              leaveTime:    s.leaveTime,
            })),
        students: students.filter(s => s.name.trim()).map(s => ({
          className: s.className,
          studentId: s.studentId,
          name:      s.name,
        })),
        dept:            dept.trim() || "電腦科",
        fad8Category,
        fad8Achievement,
      }

      const res = await fetch("/api/activity-docs/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error((j as any).error ?? "生成失敗")
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const safe = activityName.slice(0,20).replace(/[\\/:*?"<>|]/g,"_")
      a.download = `${safe}_文件.zip`
      document.body.appendChild(a)
      a.click()
      setTimeout(() => { URL.revokeObjectURL(url); a.remove() }, 1000)
    } catch (e: any) {
      setError(e?.message ?? "發生錯誤，請稍後再試。")
    } finally {
      setGenerating(false)
    }
  }

  // ── Styles ────────────────────────────────────────────

  const cardCls = "card p-5 mb-4"
  const legendCls = "text-caption font-bold tracking-widest uppercase mb-4 pb-2 border-b"
  const inputCls = "w-full px-3 py-2 text-body rounded-input border outline-none focus:ring-2 focus:ring-[var(--color-admin)] focus:border-transparent transition-shadow"
  const labelCls = "text-caption block mb-1"

  const adminColor = "var(--color-admin)"

  // ── Render ────────────────────────────────────────────

  return (
    <div className="p-6 pb-32 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Link href="/teacher/committee/admin" className="text-caption" style={{ color: "var(--color-ink-400)" }}>← 行政</Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">活動文件生成器</h1>
      </div>
      <p className="text-caption mb-6" style={{ color: "var(--color-ink-400)" }}>
        填寫一份表單，一鍵生成通告、出席紀錄及 FAD8 學生學習紀錄 (ZIP 下載)。
      </p>

      {/* ① 基本資料 */}
      <div className={cardCls} style={{ borderTop: "3px solid " + adminColor }}>
        <h2 className={legendCls} style={{ color: "var(--color-ink-900)" }}>① 基本資料</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className={labelCls}>活動名稱 <span className="text-red-500">*</span></label>
            <input className={inputCls} value={activityName} onChange={e => setActivityName(e.target.value)}
              placeholder="例：創意科技學會活動（第二學期）" />
          </div>
          <div>
            <label className={labelCls}>通告編號</label>
            <input className={inputCls} value={noticeNum} onChange={e => setNoticeNum(e.target.value)}
              placeholder="例：072/2025" />
          </div>
          <div>
            <label className={labelCls}>發出日期 <span className="text-red-500">*</span></label>
            <input type="date" className={inputCls} value={issueDate} onChange={e => setIssueDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>負責老師 <span className="text-red-500">*</span></label>
            <input className={inputCls} value={teacher} onChange={e => setTeacher(e.target.value)}
              placeholder="例：盧智明" />
          </div>
          <div>
            <label className={labelCls}>聯絡電話</label>
            <input className={inputCls} value={contactTel} onChange={e => setContactTel(e.target.value)} />
          </div>
        </div>

        {/* Tutor type */}
        <div className="mt-4">
          <label className={labelCls}>導師類型</label>
          <div className="flex rounded-lg border overflow-hidden max-w-sm">
            {(["school","external"] as const).map((v, i) => (
              <button key={v} type="button"
                onClick={() => setTutorType(v)}
                className="flex-1 px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  background: tutorType === v ? adminColor : "#f9fafb",
                  color: tutorType === v ? "#fff" : "#555",
                  borderRight: i === 0 ? "1px solid #e5e7eb" : undefined,
                }}>
                {v === "school" ? "學校老師" : "外聘導師 / 機構"}
              </button>
            ))}
          </div>
          {tutorType === "external" && (
            <div className="mt-3 p-3 rounded-lg border text-sm" style={{ background: "#fff8e8", borderColor: "#c8a830" }}>
              <label className={labelCls}>機構 / 導師姓名（用於導師簽到表）</label>
              <input className={inputCls} value={orgName} onChange={e => setOrgName(e.target.value)}
                placeholder="例：香港科技教育學院 / 陳老師" />
              <p className="text-xs text-gray-500 mt-1">選擇外聘導師後，ZIP 將額外包含「導師簽到.docx」。</p>
            </div>
          )}
        </div>
      </div>

      {/* ② 活動節數 */}
      <div className={cardCls}>
        <h2 className={legendCls} style={{ color: "var(--color-ink-900)" }}>② 活動節數</h2>

        {/* Template toggle */}
        <div className="mb-4">
          <label className={labelCls}>通告格式</label>
          <div className="flex rounded-lg border overflow-hidden max-w-sm">
            {(["1","2"] as const).map((v, i) => (
              <button key={v} type="button"
                onClick={() => setNoticeType(v)}
                className="flex-1 px-3 py-2 text-sm font-medium transition-colors"
                style={{
                  background: noticeType === v ? adminColor : "#f9fafb",
                  color: noticeType === v ? "#fff" : "#555",
                  borderRight: i === 0 ? "1px solid #e5e7eb" : undefined,
                }}>
                {v === "1" ? "範本一（單欄）" : "範本二（雙欄）"}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {noticeType === "1" ? "單欄通告：填入共用時間和地點，可新增多個活動日期。" : "雙欄通告：兩組活動各自填寫日期、時間及地點。"}
          </p>
        </div>

        {/* Template 1: shared time/location + date list */}
        {noticeType === "1" && (
          <>
            <div className="bg-gray-50 border rounded-lg p-3 mb-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="col-span-2 sm:col-span-1">
                  <label className={labelCls}>統一時間</label>
                  <input className={inputCls} value={sessions[0]?.time ?? ""} onChange={e => setSessions(prev => prev.map((s,i) => i === 0 ? { ...s, time: e.target.value } : { ...s, time: e.target.value }))}
                    placeholder="3:30 p.m. – 4:30 p.m." />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className={labelCls}>統一地點</label>
                  <input className={inputCls} value={sessions[0]?.location ?? ""} onChange={e => setSessions(prev => prev.map((s,i) => i === 0 ? { ...s, location: e.target.value } : { ...s, location: e.target.value }))}
                    placeholder="電腦室（107室）" />
                </div>
                <div>
                  <label className={labelCls}>到校時間</label>
                  <input className={inputCls} value={sessions[0]?.arriveTime ?? ""} onChange={e => setSessions(prev => prev.map(s => ({ ...s, arriveTime: e.target.value })))}
                    placeholder="15:00" />
                </div>
                <div>
                  <label className={labelCls}>離校時間</label>
                  <input className={inputCls} value={sessions[0]?.leaveTime ?? ""} onChange={e => setSessions(prev => prev.map(s => ({ ...s, leaveTime: e.target.value })))}
                    placeholder="17:00" />
                </div>
              </div>
            </div>

            <p className="text-xs font-bold text-gray-500 mb-2">活動日期</p>
            <div className="space-y-2 mb-2">
              {sessions.map((s) => {
                const weekday = s.date ? WEEKDAYS[new Date(s.date + "T00:00:00").getDay()] : "—"
                return (
                  <div key={s.id} className="flex items-center gap-2 bg-gray-50 border rounded-lg px-3 py-2">
                    <input type="date" className="flex-shrink-0 px-2 py-1.5 text-sm rounded-md border outline-none focus:ring-2 focus:ring-[var(--color-admin)] focus:border-transparent transition-shadow" style={{ width: 500 }} value={s.date}
                      onChange={e => updateSession(s.id, "date", e.target.value)} />
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "#e8eef8", color: adminColor, minWidth: 52, textAlign:"center" }}>
                      {weekday}
                    </span>
                    {sessions.length > 1 && (
                      <button onClick={() => removeSession(s.id)} className="ml-auto flex-shrink-0 w-7 h-7 flex items-center justify-center bg-red-500 text-white rounded-md hover:bg-red-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => addSession()}
                className="flex-1 flex items-center justify-center gap-1 text-sm font-bold py-2 rounded-lg border-2 border-dashed transition-colors"
                style={{ borderColor: adminColor, color: adminColor, background: "#f0f4ff" }}>
                <Plus className="w-4 h-4" /> 新增日期（自動 +7 天）
              </button>
              <button type="button" onClick={() => setShowBatchModal(true)}
                className="px-4 text-sm font-bold py-2 rounded-lg border-2 border-dashed transition-colors whitespace-nowrap"
                style={{ borderColor: adminColor, color: adminColor, background: "#f0f4ff" }}>
                <CalendarDays className="w-4 h-4 inline mr-1" />批量選日
              </button>
            </div>
          </>
        )}

        {/* Template 2: two session cards */}
        {noticeType === "2" && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              {[0, 1].map(colIdx => {
                // Ensure we have 2 sessions for T2
                const s = sessions[colIdx] ?? { id: colIdx + 100, date:"", time:"", location:"", activityName:"", arriveTime:"", leaveTime:"" }
                return (
                  <div key={colIdx} className="bg-gray-50 border rounded-xl p-3">
                    <span className="inline-block text-xs font-bold text-white px-3 py-1 rounded-md mb-3"
                      style={{ background: adminColor }}>{colIdx === 0 ? "第一欄" : "第二欄"}</span>
                    <div className="space-y-2">
                      <div>
                        <label className={labelCls}>活動名稱（留空則與主標題相同）</label>
                        <input className={inputCls} value={s.activityName}
                          onChange={e => {
                            setSessions(prev => {
                              const next = [...prev]
                              while (next.length <= colIdx) next.push({ id: nextSessId.current++, date:"", time:"", location:"", activityName:"", arriveTime:"", leaveTime:"" })
                              next[colIdx] = { ...next[colIdx], activityName: e.target.value }
                              return next
                            })
                          }} placeholder="同主標題" />
                      </div>
                      <div>
                        <label className={labelCls}>日期</label>
                        <input type="date" className={inputCls} value={s.date}
                          onChange={e => {
                            setSessions(prev => {
                              const next = [...prev]
                              while (next.length <= colIdx) next.push({ id: nextSessId.current++, date:"", time:"", location:"", activityName:"", arriveTime:"", leaveTime:"" })
                              next[colIdx] = { ...next[colIdx], date: e.target.value }
                              return next
                            })
                          }} />
                      </div>
                      <div>
                        <label className={labelCls}>時間</label>
                        <input className={inputCls} value={s.time}
                          onChange={e => {
                            setSessions(prev => {
                              const next = [...prev]
                              while (next.length <= colIdx) next.push({ id: nextSessId.current++, date:"", time:"", location:"", activityName:"", arriveTime:"", leaveTime:"" })
                              next[colIdx] = { ...next[colIdx], time: e.target.value }
                              return next
                            })
                          }} placeholder="3:30 p.m. – 4:30 p.m." />
                      </div>
                      <div>
                        <label className={labelCls}>地點</label>
                        <input className={inputCls} value={s.location}
                          onChange={e => {
                            setSessions(prev => {
                              const next = [...prev]
                              while (next.length <= colIdx) next.push({ id: nextSessId.current++, date:"", time:"", location:"", activityName:"", arriveTime:"", leaveTime:"" })
                              next[colIdx] = { ...next[colIdx], location: e.target.value }
                              return next
                            })
                          }} placeholder={colIdx === 0 ? "電腦室（107室）" : "副堂"} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="grid grid-cols-2 gap-3 max-w-xs">
              <div>
                <label className={labelCls}>到校時間</label>
                <input className={inputCls} value={t2Arrive} onChange={e => setT2Arrive(e.target.value)} placeholder="15:00" />
              </div>
              <div>
                <label className={labelCls}>離校時間</label>
                <input className={inputCls} value={t2Leave} onChange={e => setT2Leave(e.target.value)} placeholder="17:00" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* ③ 通告正文 + 預覽 */}
      <div className={cardCls}>
        <h2 className={legendCls} style={{ color: "var(--color-ink-900)" }}>③ 通告正文</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          {[...BODY_TEMPLATES, ""].map((_, idx) => (
            <button key={idx} type="button"
              onClick={() => selectBodyChip(idx)}
              className="px-3 py-1.5 rounded-full text-xs font-medium border transition-colors"
              style={{
                background: bodyChipIdx === idx ? adminColor : "#f5f7fb",
                color:      bodyChipIdx === idx ? "#fff" : "#444",
                borderColor: bodyChipIdx === idx ? adminColor : "#e5e7eb",
              }}>
              {idx === 0 ? "課外活動申請"
               : idx === 1 ? "比賽 / 校際活動"
               : idx === 2 ? "交流 / 回訪活動"
               : idx === 3 ? "工作坊 / 培訓"
               : "自行輸入"}
            </button>
          ))}
        </div>
        <textarea
          className={`${inputCls} resize-y`}
          rows={3}
          value={bodyText}
          onChange={e => onBodyEdit(e.target.value)}
        />

        {/* Live preview toggle */}
        <button type="button"
          onClick={() => setPreviewOpen(v => !v)}
          className="mt-3 w-full flex items-center justify-between text-sm font-bold px-4 py-2.5 rounded-lg border transition-colors"
          style={{
            background: previewOpen ? "#eef3fb" : "#f9fafb",
            borderColor: previewOpen ? adminColor : "#e5e7eb",
            color: previewOpen ? adminColor : "#555",
          }}>
          <span>預覽通告樣式</span>
          {previewOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {previewOpen && (
          <div className="mt-3 border rounded-xl overflow-hidden">
            <div className="bg-gray-50 border-b px-4 py-2 text-xs text-gray-500 flex items-center gap-3">
              <span>預覽（模擬通告格式，供參考）</span>
            </div>
            <div className="overflow-x-auto bg-gray-100 p-4">
              <div
                className="bg-white shadow-md mx-auto p-10"
                style={{ width: 595, minHeight: 780, fontFamily: "'Microsoft JhengHei', serif", fontSize: 13.5, lineHeight: 2, color: "#111" }}
                dangerouslySetInnerHTML={{ __html: buildPreviewHtml() }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ④ 學生名單 */}
      <div className={cardCls}>
        <h2 className={legendCls} style={{ color: "var(--color-ink-900)" }}>④ 學生名單</h2>
        <div className="flex items-start gap-2 p-3 rounded-lg border text-xs text-blue-800 mb-3" style={{ background: "#f0f7ff", borderColor: "#b3d1f5" }}>
          <Users className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>從 Excel 複製後，<strong>點擊任何一格再按 Ctrl+V</strong>，系統自動填入。欄位順序：<strong>班級 → 學號 → 學生姓名</strong>。</span>
        </div>
        <div className="overflow-x-auto">
          <table ref={studentTableRef} className="w-full text-sm border-collapse" onPaste={handleTablePaste}>
            <thead>
              <tr>
                <th className="bg-gray-700 text-white text-xs font-bold px-2 py-2 text-center w-8">#</th>
                <th className="bg-gray-700 text-white text-xs font-bold px-2 py-2 text-left">班級</th>
                <th className="bg-gray-700 text-white text-xs font-bold px-2 py-2 text-left">學號</th>
                <th className="bg-gray-700 text-white text-xs font-bold px-2 py-2 text-left">學生姓名</th>
                <th className="bg-gray-700 text-white w-8" />
              </tr>
            </thead>
            <tbody>
              {students.map((st, idx) => (
                <tr key={st.id} className={idx % 2 === 1 ? "bg-gray-50" : "bg-white"}>
                  <td className="text-center text-xs text-gray-400 px-2 py-1">{idx + 1}</td>
                  <td className="px-1 py-0.5">
                    <input className="w-full bg-transparent px-2 py-1 text-sm focus:outline-2 focus:outline-[var(--color-admin)] rounded focus:bg-white" style={{ minWidth: 52 }}
                      value={st.className} onChange={e => updateStudent(st.id, "className", e.target.value)} placeholder="1A" />
                  </td>
                  <td className="px-1 py-0.5">
                    <input className="w-full bg-transparent px-2 py-1 text-sm focus:outline-2 focus:outline-[var(--color-admin)] rounded focus:bg-white" style={{ width: 70 }}
                      value={st.studentId} onChange={e => updateStudent(st.id, "studentId", e.target.value)} placeholder="01" />
                  </td>
                  <td className="px-1 py-0.5">
                    <input className="w-full bg-transparent px-2 py-1 text-sm focus:outline-2 focus:outline-[var(--color-admin)] rounded focus:bg-white"
                      value={st.name} onChange={e => updateStudent(st.id, "name", e.target.value)} placeholder="學生姓名" />
                  </td>
                  <td className="px-1 py-0.5">
                    <button onClick={() => removeStudent(st.id)} className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <button type="button" onClick={() => addStudent()}
            className="text-xs font-bold px-4 py-1.5 rounded-lg border-2 border-dashed transition-colors"
            style={{ borderColor: adminColor, color: adminColor, background: "#f0f4ff" }}>
            + 新增行
          </button>
          {students.length > 0 && (
            <button type="button" onClick={() => { if (confirm("確定清空所有學生資料？")) setStudents([]) }}
              className="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-500 hover:bg-red-50 transition-colors">
              清空
            </button>
          )}
          <span className="text-xs text-gray-400 ml-auto">{students.filter(s => s.name.trim()).length} 名學生</span>
        </div>
        <p className="text-xs text-gray-400 mt-2">此名單將填入「出席紀錄.xlsx」及「FAD8.xlsx」。</p>
      </div>

      {/* ⑤ FAD8 */}
      <div className={cardCls}>
        <h2 className={legendCls} style={{ color: "var(--color-ink-900)" }}>⑤ FAD8 學生學習紀錄設定</h2>
        <p className="text-xs text-gray-500 mb-3">
          <strong>奬項／表現說明</strong>（第6欄）= 活動類別；<strong>範疇</strong>（第7欄）= 學生表現描述。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <label className={labelCls}>奬項／表現說明（第6欄）</label>
            <select className={inputCls} value={fad8Category} onChange={e => setFad8Category(e.target.value)}>
              {FAD8_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-1">
            <label className={labelCls}>範疇（第7欄）</label>
            <select className={inputCls} value={fad8Achievement} onChange={e => setFad8Achievement(e.target.value)}>
              {FAD8_ACHIEVEMENTS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>負責科組</label>
            <input className={inputCls} value={dept} onChange={e => setDept(e.target.value)} list="dept-list" />
            <datalist id="dept-list">
              {["電腦科","數學科","英文科","中文科","科學科","體育科"].map(d => <option key={d} value={d} />)}
            </datalist>
          </div>
        </div>
      </div>

      {/* Batch modal */}
      {showBatchModal && (
        <BatchCalendarModal
          onConfirm={handleBatchDates}
          onClose={() => setShowBatchModal(false)}
          lastDate={sessions.filter(s => s.date).at(-1)?.date}
        />
      )}

      {/* Sticky action bar */}
      <div className=" bottom-0 left-0 right-0 bg-white border-t-2 px-6 py-3 flex items-center gap-4 z-40 shadow-lg"
        style={{ borderColor: "#c8a830" }}>
        <button type="button" onClick={handleGenerate} disabled={generating}
          className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-60"
          style={{ background: "linear-gradient(135deg,#c8a830,#a88520)", color: "#1a3a6b", boxShadow: "0 2px 8px rgba(200,168,48,.35)" }}>
          {generating
            ? <><Loader2 className="w-4 h-4 animate-spin" /> 生成中…</>
            : <><Download className="w-4 h-4" /> 生成所有文件 (ZIP)</>}
        </button>
        <span className="text-xs text-gray-400">
          生成：通告{tutorType === "external" ? " · 導師簽到" : ""} · 出席紀錄 · FAD8
        </span>
        {error && <span className="text-xs text-red-500 ml-auto">{error}</span>}
      </div>
    </div>
  )
}
