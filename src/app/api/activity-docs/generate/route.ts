import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin } from "@/lib/roles"
import { z } from "zod"
import fs from "fs"
import path from "path"
import PizZip from "pizzip"
import Docxtemplater from "docxtemplater"
import JSZip from "jszip"
import ExcelJS from "exceljs"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { readTemplateAsset } from "@/lib/template-assets.mjs"

// ─────────────────────────────────────────────────────────
// Chinese date helpers (port of fill_docs.py)
// ─────────────────────────────────────────────────────────

const CHINESE_DIGITS: Record<string, string> = {
  "0": "零","1": "一","2": "二","3": "三","4": "四",
  "5": "五","6": "六","7": "七","8": "八","9": "九",
}
const MONTH_NAMES = ["一","二","三","四","五","六","七","八","九","十","十一","十二"]
const DAY_NAMES = ["星期日","星期一","星期二","星期三","星期四","星期五","星期六"]
const CN = ["","一","二","三","四","五","六","七","八","九","十"]

function dayToChinese(d: number): string {
  if (d <= 10) return CN[d]
  const tens = Math.floor(d / 10)
  const ones = d % 10
  return (tens === 1 ? "" : CN[tens]) + "十" + (ones ? CN[ones] : "")
}

function numToChineseDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.trim().split("-").map(Number)
    const yearCh = String(y).split("").map((c) => CHINESE_DIGITS[c]).join("")
    const monthCh = MONTH_NAMES[m - 1]
    const dayCh = dayToChinese(d)
    return `${yearCh}年${monthCh}月${dayCh}日`
  } catch {
    return dateStr
  }
}

function dateWithWeekday(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.trim().split("-").map(Number)
    const dt = new Date(y, m - 1, d)
    return `${y}年${m}月${d}日（${DAY_NAMES[dt.getDay()]}）`
  } catch {
    return dateStr
  }
}

function formatRecurringDates(sessions: Session[]): string {
  const parts: string[] = []
  const weekdays = new Set<number>()
  for (const s of sessions) {
    if (!s.date) continue
    try {
      const [y, m, d] = s.date.trim().split("-").map(Number)
      parts.push(`${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`)
      weekdays.add(new Date(y, m - 1, d).getDay())
    } catch {
      parts.push(s.date)
    }
  }
  let result = parts.join(", ")
  if (weekdays.size === 1 && parts.length > 0) {
    result += `（${DAY_NAMES[Array.from(weekdays)[0]]}）`
  }
  return result
}

function sessionDateDisplay(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.trim().split("-").map(Number)
    return `${String(d).padStart(2,"0")}/${String(m).padStart(2,"0")}/${y}`
  } catch {
    return dateStr
  }
}

// ─────────────────────────────────────────────────────────
// Zod schema
// ─────────────────────────────────────────────────────────

const sessionSchema = z.object({
  date:         z.string().default(""),
  time:         z.string().default(""),
  location:     z.string().default(""),
  activityName: z.string().default(""),  // only used in T2 dual-column
  arriveTime:   z.string().default(""),
  leaveTime:    z.string().default(""),
})
type Session = z.infer<typeof sessionSchema>

const studentSchema = z.object({
  className: z.string().default(""),
  studentId: z.string().default(""),
  name:      z.string().default(""),
})
type Student = z.infer<typeof studentSchema>

const generateSchema = z.object({
  activityName:    z.string().min(1).max(200),
  noticeNum:       z.string().max(50).default(""),
  issueDate:       z.string().max(20),
  teacher:         z.string().max(100),
  tutorType:       z.enum(["school", "external"]).default("school"),
  orgName:         z.string().max(200).default(""),
  contactTel:      z.string().max(50).default("2342-2954"),
  bodyText:        z.string().max(2000).default(""),
  noticeType:      z.enum(["1", "2"]).default("1"),
  sessions:        z.array(sessionSchema).min(1).max(30),
  students:        z.array(studentSchema).max(500).default([]),
  dept:            z.string().max(100).default("電腦科"),
  fad8Category:    z.enum(["1","2","3","4","5","6"]).default("1"),
  fad8Achievement: z.string().max(200).default("積極參與/表現投入"),
})

const CATEGORY_MAP: Record<string, string> = {
  "1": "校外獎項及重要參與",
  "2": "德育及公民教育",
  "3": "校內及社會服務",
  "4": "體育發展",
  "5": "藝術發展",
  "6": "與工作有關的經驗",
}

const TEMPLATES = path.join(process.cwd(), "public", "templates")

async function readTemplate(filename: string): Promise<Buffer> {
  let assets = null
  try { assets = getCloudflareContext().env.ASSETS ?? null } catch { /* standard Node runtime */ }
  return readTemplateAsset(filename, assets, (name) => fs.readFileSync(path.join(TEMPLATES, name)))
}

async function renderDocx(templateFile: string, data: Record<string, string>): Promise<Uint8Array> {
  const content = await readTemplate(templateFile)
  const zip = new PizZip(content)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    // Provide empty string for any missing tag so the doc never throws
    nullGetter: () => "",
  })
  doc.render(data)
  return doc.getZip().generate({
    type: "uint8array",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }) as Uint8Array
}

// ─────────────────────────────────────────────────────────
// Document generators
// ─────────────────────────────────────────────────────────

async function buildNotice(d: z.infer<typeof generateSchema>): Promise<Uint8Array> {
  const contactLine = `如有查詢，歡迎致電${d.contactTel} 與${d.teacher}老師聯絡。`
  const issueDateCn = numToChineseDate(d.issueDate)
  const noticeNum   = d.noticeNum || ""

  if (d.noticeType === "2") {
    // Dual-column template
    const sA = d.sessions[0] ?? {}
    const sB = d.sessions[1] ?? {}
    return renderDocx("activity-notice-t2.docx", {
      activityName:   d.activityName,
      noticeNum,
      issueDateCn,
      bodyText:       d.bodyText,
      contactLine,
      teacherName:    d.teacher,
      sessionAName:   sA.activityName || d.activityName,
      sessionADate:   dateWithWeekday(sA.date || ""),
      sessionATime:   sA.time || "",
      sessionALocation: sA.location || "",
      sessionBName:   sB.activityName || d.activityName,
      sessionBDate:   dateWithWeekday(sB.date || ""),
      sessionBTime:   sB.time || "",
      sessionBLocation: sB.location || "",
    })
  }

  // Single-column
  const s0 = d.sessions[0] ?? {}
  if (d.sessions.length <= 1) {
    // T1: single date, Chinese format
    return renderDocx("activity-notice-t1.docx", {
      activityName:    d.activityName,
      noticeNum,
      issueDateCn,
      bodyText:        d.bodyText,
      contactLine,
      teacherName:     d.teacher,
      sessionDate:     dateWithWeekday(s0.date || ""),
      sessionTime:     s0.time || "",
      sessionLocation: s0.location || "",
    })
  } else {
    // T4: multiple dates, DD/MM/YYYY list
    return renderDocx("activity-notice-t4.docx", {
      activityName:    d.activityName,
      noticeNum,
      issueDateCn,
      bodyText:        d.bodyText,
      contactLine,
      teacherName:     d.teacher,
      sessionDates:    formatRecurringDates(d.sessions),
      sessionTime:     s0.time || "",
      sessionLocation: s0.location || "",
    })
  }
}

async function buildTutorSignin(d: z.infer<typeof generateSchema>): Promise<Uint8Array> {
  const tutorName = d.orgName.trim() || d.teacher
  const data: Record<string, string> = {
    tutorName,
    activityName: d.activityName,
  }
  // Fill up to 15 session slots
  for (let i = 0; i < 15; i++) {
    const n = i + 1
    const s = d.sessions[i]
    if (s) {
      data[`s${n}Date`]   = sessionDateDisplay(s.date)
      data[`s${n}Arrive`] = s.arriveTime || ""
      data[`s${n}Leave`]  = s.leaveTime  || ""
    } else {
      data[`s${n}Date`]   = ""
      data[`s${n}Arrive`] = ""
      data[`s${n}Leave`]  = ""
    }
  }
  return renderDocx("activity-tutor-signin.docx", data)
}

async function buildAttendance(d: z.infer<typeof generateSchema>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Uint8Array.from(await readTemplate("出席紀錄.xlsx")).buffer)
  const ws = wb.worksheets[0]

  ws.getCell("A1").value = `課外活動名稱：${d.activityName}`
  ws.getCell("A2").value = `負責老師：${d.teacher}`

  // Session dates as column headers starting at col E (5)
  for (let i = 0; i < d.sessions.length; i++) {
    const col = 5 + i
    const s = d.sessions[i]
    try {
      const [y, m, day] = s.date.trim().split("-").map(Number)
      ws.getCell(3, col).value = new Date(y, m - 1, day)
      ws.getCell(3, col).numFmt = "dd/mm/yyyy"
    } catch {
      ws.getCell(3, col).value = s.date
    }
  }

  // Student rows from row 4
  for (let i = 0; i < d.students.length; i++) {
    const row = 4 + i
    const st = d.students[i]
    ws.getCell(row, 1).value = i + 1
    ws.getCell(row, 2).value = st.className
    ws.getCell(row, 3).value = st.studentId
    ws.getCell(row, 4).value = st.name
  }

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

async function buildFad8(d: z.infer<typeof generateSchema>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(Uint8Array.from(await readTemplate("FAD8(25-26).xlsx")).buffer)
  const ws = wb.worksheets[0]

  const categoryText  = CATEGORY_MAP[d.fad8Category] ?? d.fad8Category
  const achievement   = d.fad8Achievement

  // Student rows from row 6
  for (let i = 0; i < d.students.length; i++) {
    const row = 6 + i
    const st = d.students[i]
    ws.getCell(row, 1).value = i + 1
    ws.getCell(row, 2).value = st.className
    ws.getCell(row, 3).value = st.studentId
    ws.getCell(row, 4).value = st.name
    ws.getCell(row, 5).value = d.activityName
    ws.getCell(row, 6).value = categoryText
    ws.getCell(row, 7).value = achievement
  }

  // Footer: search for label cells dynamically (same logic as fill_docs.py)
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < 20) return
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const v = String(cell.value ?? "")
      if (v.includes("負責科組")) {
        ws.getCell(rowNumber, colNumber + 1).value = d.dept
      }
      if (v.includes("負責老師姓名")) {
        ws.getCell(rowNumber, colNumber + 1).value = d.teacher
      }
      if (v.trim() === "日期：") {
        ws.getCell(rowNumber, colNumber + 1).value = d.issueDate
      }
    })
  })

  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

// ─────────────────────────────────────────────────────────
// POST handler
// ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  let data: z.infer<typeof generateSchema>
  try {
    data = generateSchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json({ error: "資料格式有誤，請檢查所有必填欄位。" }, { status: 400 })
  }

  try {
    const zip = new JSZip()

    // 通告.docx
    const noticeBuf = await buildNotice(data)
    zip.file("通告.docx", noticeBuf)

    // 導師簽到.docx (external tutors only)
    if (data.tutorType === "external") {
      const signinBuf = await buildTutorSignin(data)
      zip.file("導師簽到.docx", signinBuf)
    }

    // 出席紀錄.xlsx
    const attendanceBuf = await buildAttendance(data)
    zip.file("出席紀錄.xlsx", attendanceBuf)

    // FAD8.xlsx
    const fad8Buf = await buildFad8(data)
    zip.file("FAD8.xlsx", fad8Buf)

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" })
    const zipBytes = new Uint8Array(zipBuffer)

    const activitySafe = data.activityName.slice(0, 20).replace(/[\\/:*?"<>|]/g, "_")
    const filename = encodeURIComponent(`${activitySafe}_文件.zip`)

    return new NextResponse(zipBytes, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="activity_docs.zip"; filename*=UTF-8''${filename}`,
        "Content-Length": String(zipBuffer.byteLength),
      },
    })
  } catch (err) {
    console.error("[activity-docs/generate] error:", err)
    return NextResponse.json({ error: "文件生成失敗，請稍後重試。" }, { status: 500 })
  }
}
