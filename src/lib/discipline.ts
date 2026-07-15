import { prisma } from "@/lib/prisma"
import { sendEmail } from "@/lib/email"
import { notify } from "@/lib/notify"
import { BEHAVIOR_LABEL, BEHAVIOR_ORDER, isNegativeType } from "@/lib/behavior-types"
import type { BehaviorType } from "@prisma/client"

// Re-export shared constants so existing importers keep working.
export { BEHAVIOR_LABEL, BEHAVIOR_ORDER }

// Everything except a merit is a negative record (drives notify + thresholds).
export function isNegative(type: BehaviorType): boolean {
  return isNegativeType(type)
}

/** Normalize a class name for grouping / homeroom lookup. */
export function classKey(className: string): string {
  return className.trim().toUpperCase().replace(/\s+/g, "")
}

/** Map a Chinese category label (CSV import) to the enum. */
export function labelToType(label: string): BehaviorType | null {
  const t = label.trim()
  const map: Record<string, BehaviorType> = {
    "優點": "MERIT", "缺點": "DEMERIT", "小過": "MINOR_FAULT",
    "大過": "MAJOR_FAULT", "遲到": "LATE", "缺席": "ABSENT", "違規": "MISCONDUCT",
  }
  return map[t] ?? null
}

// ─── Homeroom lookup ─────────────────────────────────────────────────────────
// Sourced from the Class model (群組管理 → 班級分組). The class's homeroomTeacher
// (Class.homeroomTeacherId) is the 班主任 — their email is the follow-up target.
export async function findHomeroom(className: string) {
  const key = classKey(className)
  const classes = await prisma.class.findMany({
    include: { homeroomTeacher: { select: { id: true, name: true, email: true } } },
  })
  const match = classes.find((c) => classKey(c.name) === key)
  if (!match?.homeroomTeacher?.email) return null
  return {
    teacherName:   match.homeroomTeacher.name ?? "",
    teacherEmail:  match.homeroomTeacher.email,
    teacherUserId: match.homeroomTeacher.id,
  }
}

// ─── Threshold auto-email ────────────────────────────────────────────────────

/**
 * After a negative record is added, email the class teacher EACH time the
 * student's count for that category crosses a multiple of the configured
 * threshold (threshold=5 → notify at 5, 10, 15, …). Deduped via
 * DisciplineAlertLog.notifiedCount, which holds the highest milestone already
 * notified.
 *
 * Order matters: SEND FIRST, mark AFTER. If sendEmail/notify throw, the mark
 * is skipped and the milestone retries on the next record — a failed send is
 * never falsely recorded as "notified" (and thus never silently lost). The
 * trade-off is a negligible double-send window if two records for the same
 * (class, student, category) land at the exact same instant.
 */
export async function checkThresholdAndEmail(
  className: string,
  studentName: string,
  category: BehaviorType
): Promise<void> {
  try {
    if (!isNegative(category)) return

    const setting = await prisma.disciplineThreshold.findUnique({ where: { category } })
    if (!setting || !setting.enabled) return

    const threshold = setting.threshold
    const count = await prisma.behaviorRecord.count({
      where: { className, studentName, type: category },
    })
    if (count < threshold) return

    // Highest threshold multiple reached so far (5/10/15… when threshold=5).
    const milestone = Math.floor(count / threshold) * threshold

    // Already notified at this milestone (or a later one)?
    const existing = await prisma.disciplineAlertLog.findUnique({
      where: { className_studentName_category: { className, studentName, category } },
    })
    if (existing && existing.notifiedCount >= milestone) return

    const homeroom = await findHomeroom(className)
    const label = BEHAVIOR_LABEL[category]

    // Send FIRST, mark AFTER — a throw here skips the mark, so it retries next time.
    let notified = false
    if (homeroom?.teacherEmail) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
      await sendEmail({
        to:      homeroom.teacherEmail,
        subject: `【訓育提示】${className} ${studentName} — ${label}已達 ${milestone} 次`,
        html: `
          <div style="font-family:sans-serif;line-height:1.6">
            <p>${homeroom.teacherName} 老師：</p>
            <p>貴班學生 <strong>${studentName}</strong>（${className}）的「<strong>${label}</strong>」紀錄已累積 <strong>${count}</strong> 次，達到每 ${threshold} 次的提示節點（第 ${milestone} 次），敬請跟進。</p>
            <p>請登入系統查看詳細紀錄：<a href="${appUrl}/teacher/committee/discipline/dashboard">訓育行為儀表板</a></p>
            <p style="color:#888;font-size:12px">此電郵由基智中學校務系統自動發送。</p>
          </div>`,
        text: `${homeroom.teacherName} 老師：\n貴班學生 ${studentName}（${className}）的「${label}」紀錄已累積 ${count} 次，達到每 ${threshold} 次的提示節點（第 ${milestone} 次），敬請跟進。\n${appUrl}/teacher/committee/discipline/dashboard`,
      })
      notified = true
    }
    if (homeroom?.teacherUserId) {
      await notify({
        userId: homeroom.teacherUserId,
        type:   "BEHAVIOR",
        title:  `訓育提示：${className} ${studentName}`,
        body:   `「${label}」已累積 ${count} 次（每 ${threshold} 次提示，本次第 ${milestone} 次）`,
        link:   "/teacher/committee/discipline/dashboard",
      })
      notified = true
    }

    // Record only after we actually reached someone.
    if (notified) {
      await prisma.disciplineAlertLog.upsert({
        where:  { className_studentName_category: { className, studentName, category } },
        create: { className, studentName, category, notifiedCount: milestone },
        update: { notifiedCount: milestone, sentAt: new Date() },
      })
    }
  } catch (err) {
    console.error("checkThresholdAndEmail failed:", err)
  }
}

// ─── Class-level alert ───────────────────────────────────────────────────────

const CLASS_ALERT_THRESHOLD_KEY = "classAlertThreshold"
const CLASS_ALERT_ENABLED_KEY   = "classAlertEnabled"

export async function getClassAlertSetting(): Promise<{ threshold: number; enabled: boolean }> {
  const rows = await prisma.schoolSetting.findMany({
    where: { key: { in: [CLASS_ALERT_THRESHOLD_KEY, CLASS_ALERT_ENABLED_KEY] } },
  })
  const map = new Map(rows.map((r) => [r.key, r.value]))
  return {
    threshold: Number(map.get(CLASS_ALERT_THRESHOLD_KEY) ?? 20),
    enabled:   map.get(CLASS_ALERT_ENABLED_KEY) === "true",
  }
}

export async function setClassAlertSetting(threshold: number, enabled: boolean): Promise<void> {
  await prisma.$transaction([
    prisma.schoolSetting.upsert({
      where: { key: CLASS_ALERT_THRESHOLD_KEY },
      create: { key: CLASS_ALERT_THRESHOLD_KEY, value: String(threshold) },
      update: { value: String(threshold) },
    }),
    prisma.schoolSetting.upsert({
      where: { key: CLASS_ALERT_ENABLED_KEY },
      create: { key: CLASS_ALERT_ENABLED_KEY, value: String(enabled) },
      update: { value: String(enabled) },
    }),
  ])
}

/** Count a class's negative (non-merit) behavior records. */
export function negativeCountWhere(className: string) {
  return { className, type: { not: "MERIT" as BehaviorType } }
}

/**
 * After negative records are added for a class, email the 班主任 EACH time the
 * class's total misbehaviour count crosses a multiple of the configured class
 * threshold (threshold=20 → notify at 20, 40, 60, …). Same send-first /
 * mark-after discipline as checkThresholdAndEmail — a failed send isn't
 * recorded as notified and retries on the next record.
 */
export async function checkClassAlert(className: string): Promise<void> {
  try {
    const { threshold, enabled } = await getClassAlertSetting()
    if (!enabled) return

    const count = await prisma.behaviorRecord.count({ where: negativeCountWhere(className) })
    if (count < threshold) return

    // Highest threshold multiple reached (notify every N class-wide violations).
    const milestone = Math.floor(count / threshold) * threshold

    const existing = await prisma.disciplineClassAlertLog.findUnique({ where: { className } })
    if (existing && existing.notifiedCount >= milestone) return

    const homeroom = await findHomeroom(className)

    // Send FIRST, mark AFTER — a throw here skips the mark, so it retries next time.
    let notified = false
    if (homeroom?.teacherEmail) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
      await sendEmail({
        to:      homeroom.teacherEmail,
        subject: `【訓育班級警示】${className} 違規紀錄已達 ${milestone} 宗`,
        html: `
          <div style="font-family:sans-serif;line-height:1.6">
            <p>${homeroom.teacherName} 老師：</p>
            <p>貴班（<strong>${className}</strong>）的違規類紀錄總數已累積 <strong>${count}</strong> 宗，達到每 ${threshold} 宗的班級警示節點（第 ${milestone} 宗），敬請留意班級紀律情況並跟進。</p>
            <p><a href="${appUrl}/teacher/committee/discipline/dashboard">開啟訓育行為儀表板</a></p>
            <p style="color:#888;font-size:12px">此電郵由基智中學校務系統自動發送。</p>
          </div>`,
        text: `${homeroom.teacherName} 老師：\n貴班（${className}）的違規類紀錄總數已累積 ${count} 宗，達到每 ${threshold} 宗的班級警示節點（第 ${milestone} 宗），敬請跟進。\n${appUrl}/teacher/committee/discipline/dashboard`,
      })
      notified = true
    }
    if (homeroom?.teacherUserId) {
      await notify({
        userId: homeroom.teacherUserId,
        type:   "BEHAVIOR",
        title:  `班級警示：${className}`,
        body:   `違規紀錄已累積 ${count} 宗（每 ${threshold} 宗提示，本次第 ${milestone} 宗）`,
        link:   "/teacher/committee/discipline/dashboard",
      })
      notified = true
    }

    // Record only after we actually reached someone.
    if (notified) {
      await prisma.disciplineClassAlertLog.upsert({
        where:  { className },
        create: { className, notifiedCount: milestone },
        update: { notifiedCount: milestone, sentAt: new Date() },
      })
    }
  } catch (err) {
    console.error("checkClassAlert failed:", err)
  }
}
