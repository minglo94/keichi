import { NextRequest, NextResponse } from "next/server"
import ExcelJS from "exceljs"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isTeacherOrAdmin } from "@/lib/roles"
import { requireClassAccess } from "@/lib/class-perm"
import { loadRoster } from "@/lib/classroom-roster"
import { emptyLayout, parseLayout, reconcile, rcOf } from "@/lib/seating"
import { hkYmd } from "@/lib/hk-date"

// GET — the seating chart as an Excel workbook: 座位表 laid out as the room,
// and 名單 as a flat sortable list. Same structure as fad8/export.
//
// The sheet mirrors the screen exactly, 講台 included: if the teacher has the
// 講台 at the bottom on screen, it is at the bottom on paper. Clever flipping is
// how printed seating charts end up backwards.
export async function GET(_req: NextRequest, { params }: { params: { classId: string } }) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const gate = await requireClassAccess(params.classId, session.user)
  if (gate instanceof NextResponse) return gate

  const [roster, plan] = await Promise.all([
    loadRoster(gate.cls.id, gate.cls.name),
    prisma.seatingPlan.findFirst({ where: { classId: gate.cls.id, isDefault: true }, orderBy: { updatedAt: "desc" } }),
  ])
  const byId = new Map(roster.map((r) => [r.id, r]))
  const { layout } = reconcile(plan ? parseLayout(plan.layout) : emptyLayout(), new Set(byId.keys()))
  const groupById = new Map(layout.groups.map((g) => [g.id, g]))

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("座位表", {
    // One A4 landscape page whatever the grid size — Excel scales to fit.
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
  })
  const cols = layout.cols
  const thin = { style: "thin" as const, color: { argb: "FF6B7280" } }

  const title = ws.addRow([`${gate.cls.name} 座位表`])
  title.font = { bold: true, size: 16 }
  ws.mergeCells(title.number, 1, title.number, cols)
  const sub = ws.addRow([`列印日期：${hkYmd()}　·　${roster.length} 人`])
  sub.font = { size: 10, color: { argb: "FF6B7280" } }
  ws.mergeCells(sub.number, 1, sub.number, cols)
  ws.addRow([])

  const addFront = () => {
    const row = ws.addRow(["講　台"])
    ws.mergeCells(row.number, 1, row.number, cols)
    const c = row.getCell(1)
    c.alignment = { horizontal: "center", vertical: "middle" }
    c.font = { bold: true, color: { argb: "FFFFFFFF" } }
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } }
    row.height = 22
  }

  if (layout.frontAtTop) addFront()

  for (let r = 0; r < layout.rows; r++) {
    const row = ws.addRow(Array.from({ length: cols }, () => ""))
    row.height = 42
    for (let c = 0; c < cols; c++) {
      const cell = layout.cells[r * cols + c]
      const xl = row.getCell(c + 1)
      xl.alignment = { horizontal: "center", vertical: "middle", wrapText: true }
      if (cell.kind === "blank") continue             // no border: the aisle shows as a gap
      if (cell.kind === "label") {
        xl.value = cell.text
        xl.font = { italic: true, color: { argb: "FF6B7280" } }
        continue
      }
      xl.border = { top: thin, left: thin, bottom: thin, right: thin }
      const s = cell.studentId ? byId.get(cell.studentId) : undefined
      if (s) xl.value = `${s.tag}\n${s.name ?? s.nameEn ?? ""}`
      const g = cell.group ? groupById.get(cell.group) : undefined
      if (g) xl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${g.color}` } }
    }
  }

  if (!layout.frontAtTop) addFront()

  // 分組 legend under the chart.
  if (layout.groups.length > 0) {
    ws.addRow([])
    const counts = new Map<string, number>()
    for (const c of layout.cells) if (c.kind === "seat" && c.group && c.studentId) counts.set(c.group, (counts.get(c.group) ?? 0) + 1)
    for (const g of layout.groups) {
      const row = ws.addRow([g.name, `${counts.get(g.id) ?? 0} 人`])
      row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${g.color}` } }
    }
  }

  ws.columns = Array.from({ length: cols }, () => ({ width: 14 }))

  // 名單 — the sortable version.
  const list = wb.addWorksheet("名單")
  const head = list.addRow(["班別", "學號", "姓名", "英文姓名", "組別", "座位"])
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } }
    c.font = { bold: true, color: { argb: "FFFFFFFF" } }
  })
  const seatOf = new Map<string, { label: string; group: string }>()
  layout.cells.forEach((c, i) => {
    if (c.kind !== "seat" || !c.studentId) return
    const [r, col] = rcOf(layout, i)
    seatOf.set(c.studentId, {
      label: `第${r + 1}行第${col + 1}個`,
      group: c.group ? groupById.get(c.group)?.name ?? "" : "",
    })
  })
  for (const s of roster) {
    const seat = seatOf.get(s.id)
    list.addRow([
      s.formClass ?? gate.cls.name, s.formNo ?? s.classNumber ?? "",
      s.name ?? "", s.nameEn ?? "", seat?.group ?? "", seat?.label ?? "未入座",
    ])
  }
  list.columns = [{ width: 8 }, { width: 8 }, { width: 14 }, { width: 22 }, { width: 10 }, { width: 14 }]

  const buf = await wb.xlsx.writeBuffer()
  const filename = `${gate.cls.name}座位表_${hkYmd()}.xlsx`
  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      // RFC 5987 form: the plain filename= form mangles Chinese.
      "Content-Disposition": `attachment; filename="seating.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
