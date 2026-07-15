import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { sendEmail, isEmailConfigured } from "@/lib/email"
import { findHomeroom, BEHAVIOR_LABEL } from "@/lib/discipline"
import type { BehaviorType } from "@prisma/client"
import { z } from "zod"

const schema = z.object({
  className:   z.string().min(1),
  studentName: z.string().min(1).optional(), // omit → class-level summary
  note:        z.string().max(1000).optional(),
})

// POST — email a class's 班主任 for follow-up.
// With studentName: a single student's summary. Without: a class overview
// (top offenders across negative categories).
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  if (!isEmailConfigured()) {
    return NextResponse.json({ error: "系統尚未設定電郵服務（RESEND_API_KEY）" }, { status: 503 })
  }

  const { className, studentName, note } = schema.parse(await req.json())

  const homeroom = await findHomeroom(className)
  if (!homeroom?.teacherEmail) {
    return NextResponse.json({ error: `班別「${className}」尚未設定班主任電郵，請先到管理員的班級管理填寫。` }, { status: 400 })
  }

  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? ""
  const senderNm = session.user.name ?? "訓育組"
  const cell     = (v: string) => `<td style="padding:4px 8px;border:1px solid #ddd">${v}</td>`
  let subject = ""
  let bodyInner = ""

  if (studentName) {
    // ── Student-level ──
    const records = await prisma.behaviorRecord.findMany({
      where: { className, studentName }, orderBy: { date: "desc" }, take: 50,
    })
    const counts = records.reduce<Record<string, number>>((a, r) => { a[r.type] = (a[r.type] ?? 0) + 1; return a }, {})
    const summary = Object.entries(counts).map(([t, n]) => `${BEHAVIOR_LABEL[t as BehaviorType]} ${n} 次`).join("、") || "暫無紀錄"
    const rows = records.slice(0, 10).map((r) =>
      `<tr>${cell(new Date(r.date).toLocaleDateString("zh-HK"))}${cell(BEHAVIOR_LABEL[r.type])}${cell(r.description)}</tr>`).join("")

    subject = `【訓育跟進】${className} ${studentName} 行為紀錄`
    bodyInner = `
      <p>訓育組請你跟進貴班學生 <strong>${studentName}</strong>（${className}）的行為表現。</p>
      <p><strong>紀錄摘要：</strong>${summary}</p>
      ${note ? `<p><strong>訓育組備註：</strong>${note}</p>` : ""}
      ${rows ? `<table style="border-collapse:collapse;margin-top:8px"><thead><tr>${cell("日期")}${cell("類別")}${cell("描述")}</tr></thead><tbody>${rows}</tbody></table>` : ""}`
  } else {
    // ── Class-level ──
    const negatives = await prisma.behaviorRecord.findMany({
      where: { className, type: { not: "MERIT" } }, orderBy: { date: "desc" }, take: 500,
    })
    const perStudent = new Map<string, number>()
    for (const r of negatives) perStudent.set(r.studentName, (perStudent.get(r.studentName) ?? 0) + 1)
    const top = Array.from(perStudent.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)
    const rows = top.map(([name, n]) => `<tr>${cell(name)}${cell(String(n))}</tr>`).join("")

    subject = `【訓育班級跟進】${className} 行為概況`
    bodyInner = `
      <p>訓育組請你留意貴班（<strong>${className}</strong>）的整體紀律情況，違規類紀錄合共 <strong>${negatives.length}</strong> 宗。</p>
      ${note ? `<p><strong>訓育組備註：</strong>${note}</p>` : ""}
      ${rows ? `<p style="margin-top:8px"><strong>違規次數較多的學生：</strong></p><table style="border-collapse:collapse"><thead><tr>${cell("學生")}${cell("違規次數")}</tr></thead><tbody>${rows}</tbody></table>` : ""}`
  }

  let result
  try {
    result = await sendEmail({
      to:      homeroom.teacherEmail,
      subject,
      html: `<div style="font-family:sans-serif;line-height:1.6">
        <p>${homeroom.teacherName} 老師：</p>
        ${bodyInner}
        <p style="margin-top:12px"><a href="${appUrl}/teacher/committee/discipline/dashboard">開啟訓育行為儀表板</a></p>
        <p style="color:#888;font-size:12px">由 ${senderNm} 透過基智中學校務系統發送。</p>
      </div>`,
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: "電郵發送失敗，請稍後再試。", detail }, { status: 502 })
  }

  if (result.skipped) {
    return NextResponse.json({ error: "RESEND_API_KEY 未設定，無法發送電郵。", detail: "EMAIL_SKIPPED" }, { status: 503 })
  }

  if (homeroom.teacherUserId) {
    await prisma.notification.create({
      data: {
        userId: homeroom.teacherUserId,
        type:   "BEHAVIOR",
        title:  studentName ? `訓育跟進：${className} ${studentName}` : `訓育班級跟進：${className}`,
        body:   studentName ? undefined : "請查看班級行為概況",
        link:   "/teacher/committee/discipline/dashboard",
      },
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, sentTo: homeroom.teacherEmail })
}
