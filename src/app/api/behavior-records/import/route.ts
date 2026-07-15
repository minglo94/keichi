import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin, canEditCommittee } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { classKey, labelToType, isNegative, checkThresholdAndEmail, checkClassAlert } from "@/lib/discipline"

const MAX_ROWS = 2000

// POST — bulk import behavior records from CSV.
// Columns: 日期,班別,學生,類別,描述,跟進
// 類別 accepts: 優點 缺點 小過 大過 遲到 缺席 違規
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!(await canEditCommittee(session.user.id, session.user.role, "DISCIPLINE"))) {
    return NextResponse.json({ error: "管理員或訓育組長專屬功能" }, { status: 403 })
  }

  const formData = await req.formData()
  const file = formData.get("file")
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "沒有上載檔案" }, { status: 400 })
  }

  const text  = await file.text()
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length < 2) {
    return NextResponse.json({ error: "CSV 需包含標題列及至少一行資料" }, { status: 400 })
  }

  const dataLines = lines.slice(1) // skip header
  if (dataLines.length > MAX_ROWS) {
    return NextResponse.json({ error: `一次最多匯入 ${MAX_ROWS} 行，請分批上載。` }, { status: 400 })
  }

  const errors: { row: number; reason: string }[] = []
  const toCreate: { date: Date; className: string; studentName: string; classKey: string; type: ReturnType<typeof labelToType>; description: string; action: string | null; authorId: string }[] = []

  for (let i = 0; i < dataLines.length; i++) {
    const parts = dataLines[i].split(",")
    if (parts.length < 4) {
      errors.push({ row: i + 2, reason: "欄位不足（需要 日期,班別,學生,類別）" })
      continue
    }
    const [dateRaw, className, studentName, typeRaw, description = "", action = ""] = parts.map((p) => p.trim())

    const type = labelToType(typeRaw)
    if (!type) {
      errors.push({ row: i + 2, reason: `未知類別「${typeRaw}」` })
      continue
    }
    const date = new Date(dateRaw)
    if (isNaN(date.getTime())) {
      errors.push({ row: i + 2, reason: `日期格式無效「${dateRaw}」` })
      continue
    }
    if (!className || !studentName) {
      errors.push({ row: i + 2, reason: "班別或學生姓名空白" })
      continue
    }

    toCreate.push({
      date, className, studentName, classKey: classKey(className),
      type, description: description || "（匯入）", action: action || null,
      authorId: session.user.id,
    })
  }

  let created = 0
  if (toCreate.length > 0) {
    const result = await prisma.behaviorRecord.createMany({
      data: toCreate.map((r) => ({ ...r, type: r.type! })),
    })
    created = result.count
  }

  // Run threshold checks for affected (class, student, negative category) combos.
  const seen = new Set<string>()
  const affectedClasses = new Set<string>()
  for (const r of toCreate) {
    if (!r.type || !isNegative(r.type)) continue
    affectedClasses.add(r.className)
    const k = `${r.className}|${r.studentName}|${r.type}`
    if (seen.has(k)) continue
    seen.add(k)
    await checkThresholdAndEmail(r.className, r.studentName, r.type)
  }
  // Class-level alert once per affected class.
  for (const className of Array.from(affectedClasses)) {
    await checkClassAlert(className)
  }

  return NextResponse.json({ created, errors })
}
