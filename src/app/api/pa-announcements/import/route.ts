import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import ExcelJS from "exceljs"

type Priority = "NORMAL" | "IMPORTANT" | "URGENT"
type Status   = "DRAFT" | "PUBLISHED" | "ARCHIVED"

const VALID_PRIORITY = new Set<Priority>(["NORMAL", "IMPORTANT", "URGENT"])
const VALID_STATUS   = new Set<Status>(["DRAFT", "PUBLISHED", "ARCHIVED"])

const MAX_ROWS = 1000

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return ""
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === "object" && "text" in v) return String((v as { text: unknown }).text ?? "")
  if (typeof v === "object" && "result" in v) return String((v as { result: unknown }).result ?? "")
  return String(v).trim()
}

// Interpret a cell as a publish date (Hong Kong day). Falls back to now().
function parseDate(v: ExcelJS.CellValue): Date {
  if (v instanceof Date) return v
  const s = cellText(v)
  const m = s.match(/^\d{4}-\d{2}-\d{2}/)
  if (m) return new Date(`${m[0]}T08:00:00+08:00`)
  return new Date()
}

// POST — bulk-import PA announcements from an .xlsx file.
// Expected columns (matching export): 日期, 分類, 標題, 內容, 優先級, 狀態.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get("file")
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(await file.arrayBuffer())
  } catch {
    return NextResponse.json({ error: "無法讀取 Excel 檔案" }, { status: 400 })
  }

  const ws = wb.worksheets[0]
  if (!ws) return NextResponse.json({ error: "檔案沒有工作表" }, { status: 400 })

  // rowCount includes the header row.
  if (ws.rowCount - 1 > MAX_ROWS) {
    return NextResponse.json({ error: `一次最多匯入 ${MAX_ROWS} 行，請分批上載。` }, { status: 400 })
  }

  // Prefetch categories; create unknown ones on the fly as custom categories.
  const cats = await prisma.announcementCategory.findMany({ select: { id: true, name: true } })
  const catMap = new Map(cats.map((c) => [c.name, c.id]))

  let created = 0
  const errors: { row: number; title: string; reason: string }[] = []

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const dateRaw = row.getCell(1).value
    const catName = cellText(row.getCell(2).value)
    const title   = cellText(row.getCell(3).value)
    const body    = cellText(row.getCell(4).value)
    const priRaw  = cellText(row.getCell(5).value).toUpperCase() as Priority
    const staRaw  = cellText(row.getCell(6).value).toUpperCase() as Status

    if (!title && !body) continue // blank row
    if (!title) { errors.push({ row: r, title, reason: "缺少標題" }); continue }
    if (!body)  { errors.push({ row: r, title, reason: "缺少內容" }); continue }

    let categoryId: string | undefined
    if (catName) {
      let id = catMap.get(catName)
      if (!id) {
        const c = await prisma.announcementCategory.create({
          data:   { name: catName, createdById: session.user.id },
          select: { id: true },
        })
        id = c.id
        catMap.set(catName, id)
      }
      categoryId = id
    }

    try {
      await prisma.announcement.create({
        data: {
          title,
          body,
          priority:  VALID_PRIORITY.has(priRaw) ? priRaw : "NORMAL",
          status:    VALID_STATUS.has(staRaw)   ? staRaw : "PUBLISHED",
          categoryId,
          publishAt: parseDate(dateRaw),
          authorId:  session.user.id,
        },
      })
      created++
    } catch (err) {
      errors.push({ row: r, title, reason: err instanceof Error ? err.message : "建立失敗" })
    }
  }

  return NextResponse.json({ created, errors })
}
