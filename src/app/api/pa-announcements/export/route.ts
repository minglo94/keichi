import { isTeacherOrAdmin } from "@/lib/roles"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import ExcelJS from "exceljs"

// GET — export all PA announcements as an .xlsx workbook.
export async function GET() {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const announcements = await prisma.announcement.findMany({
    orderBy: { publishAt: "desc" },
    include: {
      author:   { select: { name: true } },
      category: { select: { name: true } },
    },
  })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("宣佈訊息")

  ws.columns = [
    { header: "日期",   key: "date",     width: 12 },
    { header: "分類",   key: "category", width: 14 },
    { header: "標題",   key: "title",    width: 30 },
    { header: "內容",   key: "body",     width: 60 },
    { header: "優先級", key: "priority", width: 10 },
    { header: "狀態",   key: "status",   width: 10 },
    { header: "撰寫人", key: "author",   width: 16 },
  ]

  for (const a of announcements) {
    ws.addRow({
      date:     a.publishAt.toISOString().slice(0, 10),
      category: a.category?.name ?? "",
      title:    a.title,
      body:     a.body,
      priority: a.priority,
      status:   a.status,
      author:   a.author?.name ?? "",
    })
  }

  const buf = await wb.xlsx.writeBuffer()

  return new NextResponse(buf, {
    headers: {
      "Content-Type":        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="pa-announcements.xlsx"`,
    },
  })
}
