import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

// Bulk student roster upsert (班級 / 學號 / 中文姓名 / 英文姓名 / 電郵).
//
// Keyed on email — re-running with an updated sheet edits the same students
// rather than creating duplicates. Also ensures the Class exists and keeps
// ClassEnrollment.classNumber in step, which is what /api/students/resolve
// matches on when a teacher pastes a roster into an activity.

const schema = z.object({
  rows: z.array(z.object({
    id:        z.number(),
    className: z.string().trim().max(20).optional().default(""),
    classNo:   z.string().trim().max(10).optional().default(""),
    nameZh:    z.string().trim().max(100).optional().default(""),
    nameEn:    z.string().trim().max(100).optional().default(""),
    email:     z.string().trim().max(200).optional().default(""),
  })).max(500),
})

// Classes auto-created here need a unique 6-char code; teachers can rename it
// later under 群組管理.
function makeClassCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { rows } = schema.parse(await req.json())

  const results: { id: number; ok: boolean; message: string }[] = []
  let created = 0
  let updated = 0

  // Cache classes by name so a 40-row paste doesn't re-query per row.
  const classCache = new Map<string, string>()

  async function ensureClass(name: string): Promise<string> {
    const key = name.toLowerCase()
    const cached = classCache.get(key)
    if (cached) return cached

    const existing = await prisma.class.findFirst({ where: { name } })
    if (existing) { classCache.set(key, existing.id); return existing.id }

    // New class — owned by the admin doing the import until reassigned.
    let code = makeClassCode()
    while (await prisma.class.findUnique({ where: { classCode: code }, select: { id: true } })) {
      code = makeClassCode()
    }
    const cls = await prisma.class.create({
      data: { name, classCode: code, teacherId: session!.user.id },
    })
    classCache.set(key, cls.id)
    return cls.id
  }

  for (const r of rows) {
    const email = r.email.toLowerCase()
    // Skip rows the user simply hasn't filled in yet.
    if (!email && !r.nameZh && !r.nameEn && !r.className) continue

    if (!email) {
      results.push({ id: r.id, ok: false, message: "缺少電郵" })
      continue
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      results.push({ id: r.id, ok: false, message: "電郵格式不正確" })
      continue
    }
    if (!r.nameZh && !r.nameEn) {
      results.push({ id: r.id, ok: false, message: "請填寫中文或英文姓名" })
      continue
    }

    try {
      const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } })

      // Never silently demote a teacher/admin who shares this email.
      if (existing && existing.role !== "STUDENT") {
        results.push({ id: r.id, ok: false, message: `此電郵已屬 ${existing.role}，未更改` })
        continue
      }

      const user = existing
        ? await prisma.user.update({
            where: { email },
            data: {
              ...(r.nameZh ? { name: r.nameZh } : {}),
              ...(r.nameEn ? { nameEn: r.nameEn } : {}),
            },
            select: { id: true },
          })
        : await prisma.user.create({
            data: {
              email,
              name:   r.nameZh || r.nameEn,
              nameEn: r.nameEn || null,
              role:   "STUDENT",
            },
            select: { id: true },
          })

      existing ? updated++ : created++

      // Enrolment — only when a class was given.
      if (r.className) {
        const classId = await ensureClass(r.className)
        await prisma.classEnrollment.upsert({
          where:  { classId_studentId: { classId, studentId: user.id } },
          create: { classId, studentId: user.id, classNumber: r.classNo || null },
          update: { classNumber: r.classNo || null },
        })
      }

      results.push({
        id: r.id,
        ok: true,
        message: existing ? "已更新" : "已新增",
      })
    } catch (err) {
      console.error("[students/bulk] row failed:", err)
      results.push({ id: r.id, ok: false, message: "儲存失敗" })
    }
  }

  return NextResponse.json({ created, updated, results })
}
