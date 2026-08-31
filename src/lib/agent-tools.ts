import type { ToolCall } from "@/lib/agents"
import {
  getTeacherLessons, periodLabelOf,
  getAllTeachers,
  getCommonFreeSlots,
  getFreeTeachers,
  getLatestTerm,
  matchTeacher,
  formatSlotsTable,
  WEEKDAY_NAMES,
  MAX_DAY,
  MAX_PERIOD,
} from "@/lib/agent-timetable"
import { commonFreeSlots, slotKey } from "@/lib/free-slots"
import { COMMITTEES, SUBJECTS } from "@/lib/school-org"
import { searchSchoolData, formatSearchResults } from "@/lib/agent-search"
import { hybridSearch, formatRetrievedChunks } from "@/lib/knowledge-base"
import { prisma } from "@/lib/prisma"
import type { Role } from "@prisma/client"

export async function runAgentTool(call: ToolCall, userId: string, role?: Role): Promise<string> {
  try {
    switch (call.tool) {
      case "timetable_query":       return await runTimetableQuery(call.params)
      case "teacher_lessons":       return await runTeacherLessons(call.params)
      case "free_teachers":         return await runFreeTeachers(call.params)
      case "group_free_slots":      return await runGroupFreeSlots(call.params)
      case "search_school_data":    return await runSearchSchoolData(call.params, userId, role)
      case "search_knowledge_base": return await runSearchKnowledgeBase(call.params, userId)
      case "get_student_profile":   return await runGetStudentProfile(call.params)
      default:
        return `工具「${call.tool}」不存在。可用工具：timetable_query（夾空堂）、group_free_slots（夾委員會／科組開會時間）、free_teachers（找空堂老師）、search_school_data（搜尋學校紀錄：公告/行為記錄/行事曆/待辦/活動/AI 生成文件）、search_knowledge_base（語義搜尋已上載嘅教材/文件內容）、get_student_profile（學生學習概況：平均分/強弱範疇）。`
    }
  } catch (err) {
    console.error("[agent-tools]", call.tool, err)
    return "工具執行失敗（系統錯誤），請向用戶道歉並建議稍後再試。"
  }
}

async function runGetStudentProfile(params: Record<string, unknown>): Promise<string> {
  const studentName = typeof params.studentName === "string" ? params.studentName.trim() : ""
  if (!studentName) return "缺少 studentName 參數。請先問清楚用戶想查邊位學生，再重新調用。"

  const matches = await prisma.user.findMany({
    where: { role: "STUDENT", name: { contains: studentName } },
    select: { id: true, name: true },
    take: 5,
  })
  if (matches.length === 0) return `搵唔到名叫「${studentName}」嘅學生。`
  if (matches.length > 1) {
    return `「${studentName}」有多個匹配：${matches.map((m) => m.name).join("、")}，請問用戶係邊位。`
  }

  const profile = await prisma.studentLearningProfile.findUnique({
    where: { studentId: matches[0].id },
  })
  if (!profile) return `${matches[0].name} 暫時未有學習概況數據（可能未提交過任何有 AI 評分嘅任務）。`

  return `${matches[0].name} 嘅學習概況：${profile.summary}`
}

async function runSearchSchoolData(params: Record<string, unknown>, userId: string, role?: Role): Promise<string> {
  const query = typeof params.query === "string" ? params.query.trim() : ""
  if (!query) return "缺少 query 參數。請先問清楚用戶想搜尋咩，再重新調用（例如學生姓名、活動名稱、關鍵字）。"

  const results = await searchSchoolData(query, userId, role)
  return formatSearchResults(query, results)
}

async function runSearchKnowledgeBase(params: Record<string, unknown>, userId: string): Promise<string> {
  const query = typeof params.query === "string" ? params.query.trim() : ""
  if (!query) return "缺少 query 參數。請先問清楚用戶想搵咩教材內容，再重新調用。"

  const chunks = await hybridSearch(query, userId)
  if (chunks.length === 0) {
    return `語義搜尋「${query}」：無相關教材內容。請向用戶說明知識庫暫時未有相關資料，唔好虛構答案。`
  }
  return `語義搜尋「${query}」：找到 ${chunks.length} 個相關教材片段：\n\n${formatRetrievedChunks(chunks)}`
}

// 「X 老師星期三要上咩堂」 — the question timetable_query cannot answer.
async function runTeacherLessons(params: Record<string, unknown>): Promise<string> {
  const query = typeof params.teacher === "string" ? params.teacher.trim() : ""
  if (!query) return "缺少 teacher 參數。請問清楚用戶想查邊位老師嘅時間表。"

  const dayRaw = params.day
  const day = typeof dayRaw === "number" ? dayRaw
            : typeof dayRaw === "string" && /^[1-5]$/.test(dayRaw) ? parseInt(dayRaw, 10)
            : undefined

  const term = typeof params.term === "string" && params.term ? params.term : await getLatestTerm()
  if (!term) return "系統尚未上載任何時間表，請建議用戶聯絡管理員上載 CSV。切勿自行推測時間表內容。"

  const allTeachers = await getAllTeachers(term)
  const m = matchTeacher(query, allTeachers)
  if (m.notFound) {
    return `時間表搵唔到「${query}」。現有老師：${allTeachers.join("、")}。\n` +
      "請如實告訴用戶搵唔到，並請佢確認姓名。切勿自行編造時間表。"
  }
  if (m.candidates) {
    return `「${query}」有多個匹配：${m.candidates.join("、")}，請問用戶係邊位。`
  }

  const name    = m.matched!
  const lessons = await getTeacherLessons(name, term, day)
  const dayText = day ? `星期${WEEKDAY_NAMES[day]}` : "全星期"

  if (lessons.length === 0) {
    return `${name} 老師喺${dayText}（學期 ${term}）冇任何課堂記錄。\n` +
      "請如實回覆冇課堂，切勿自行編造。"
  }

  const rows = lessons.map((l) =>
    `| 星期${WEEKDAY_NAMES[l.dayOfWeek]} | ${periodLabelOf(l)} | ${l.classCode ?? "—"} | ${l.subject ?? "—"} |`)

  return [
    `${name} 老師${dayText}嘅課堂（學期 ${term}，共 ${lessons.length} 節）：`,
    "",
    "| 星期 | 節次 | 班別 | 科目 |",
    "|---|---|---|---|",
    ...rows,
    "",
    "以上係系統實際紀錄。請完全按呢啲資料回覆，" +
    "唔好改動班別或科目，亦唔好加入任何未列出嘅課堂。",
  ].join("\n")
}

async function runTimetableQuery(params: Record<string, unknown>): Promise<string> {
  const queries = Array.isArray(params.teachers)
    ? (params.teachers as unknown[]).map(String).filter(Boolean)
    : []
  if (queries.length === 0) return "缺少 teachers 參數。請先問清楚用戶要夾邊幾位老師，再重新調用。"

  const term = typeof params.term === "string" && params.term ? params.term : await getLatestTerm()
  if (!term) return "系統尚未上載任何時間表，請建議用戶聯絡管理員到「設定 → 時間表上載」上載 CSV。"

  const allTeachers = await getAllTeachers(term)
  const matches = queries.map((q) => matchTeacher(q, allTeachers))

  const problems: string[] = []
  for (const m of matches) {
    if (m.notFound)   problems.push(`「${m.query}」喺時間表搵唔到`)
    if (m.candidates) problems.push(`「${m.query}」有多個匹配：${m.candidates.join("、")}，請問用戶係邊位`)
  }
  if (problems.length > 0) {
    return `老師名單有問題，請向用戶確認：\n- ${problems.join("\n- ")}\n\n時間表現有老師：${allTeachers.join("、")}`
  }

  const resolved = matches.map((m) => m.matched!)
  const slots    = await getCommonFreeSlots(resolved, term)

  if (slots.length === 0) return `查詢結果（學期 ${term}）：${resolved.join("、")} 並無共同空堂。`

  const list = slots.map((s) => `星期${WEEKDAY_NAMES[s.day]}第${s.period}節`).join("、")

  return [
    `查詢結果（學期 ${term}）：${resolved.join("、")} 共 ${slots.length} 個共同空堂。`,
    "",
    formatSlotsTable(slots),
    "",
    `時段列表：${list}`,
    "",
    "請以上面嘅 Markdown 表格（星期 × 節次 grid）展示俾用戶，並列出建議時段。",
  ].join("\n")
}

/** Fuzzy-match a name the user typed against a fixed list (「圖書館」→「圖書館委員會」). */
function matchFromList(query: string, list: readonly string[]): { matched?: string; candidates?: string[] } {
  const q = query.trim()
  if (!q) return {}
  const exact = list.find((x) => x === q)
  if (exact) return { matched: exact }
  const partial = list.filter((x) => x.includes(q) || q.includes(x))
  if (partial.length === 1) return { matched: partial[0] }
  if (partial.length > 1)   return { candidates: partial }
  return {}
}

// 「夾開會時間，圖書館委員會」 — find the members, then their common free slots.
//
// timetable_query already dovetails named teachers; this answers the question
// the way people actually ask it, by naming a group instead of listing people.
async function runGroupFreeSlots(params: Record<string, unknown>): Promise<string> {
  const committeeQ  = typeof params.committee  === "string" ? params.committee.trim()  : ""
  const departmentQ = typeof params.department === "string" ? params.department.trim() : ""
  if (!committeeQ && !departmentQ) {
    return "缺少 committee 或 department 參數。請問清楚用戶想夾邊個委員會／科組嘅時間。"
  }

  let committee = ""
  if (committeeQ) {
    const m = matchFromList(committeeQ, COMMITTEES)
    if (m.candidates) return `「${committeeQ}」有多個匹配：${m.candidates.join("、")}，請問用戶係邊一個。`
    if (!m.matched)   return `搵唔到叫「${committeeQ}」嘅委員會。現有委員會：${COMMITTEES.join("、")}。`
    committee = m.matched
  }

  let department = ""
  if (departmentQ) {
    const m = matchFromList(departmentQ, SUBJECTS)
    if (m.candidates) return `「${departmentQ}」有多個匹配：${m.candidates.join("、")}，請問用戶係邊一個。`
    department = m.matched ?? departmentQ // an unlisted 科組 may still be stored on a teacher
  }

  const staff = await prisma.user.findMany({
    where: {
      role: { in: ["TEACHER", "ADMIN"] },
      ...(committee  ? { committees:  { has: committee  } } : {}),
      ...(department ? { departments: { has: department } } : {}),
    },
    select: { id: true, name: true, nameEn: true, timetableName: true },
    take: 100,
  })

  const label = [committee, department].filter(Boolean).join(" / ")
  if (staff.length === 0) {
    return [
      `系統冇教師登記咗「${label}」。`,
      "呢個資料喺「教師資料」頁（/teacher/admin/teachers）填寫，現時可能未填。",
      "請如實話俾用戶知搵唔到成員，並建議先喺教師資料填委員會／科組；",
      "或者叫用戶直接講出成員名字，再用 timetable_query 夾空堂。切勿自行猜測邊位係成員。",
    ].join("\n")
  }

  const res = await commonFreeSlots(staff)
  if (!res.term) return "系統尚未上載任何時間表，請建議用戶聯絡管理員上載 CSV。切勿自行推測時間表內容。"

  // Someone with no timetable row has no lessons, so counting them would make
  // every slot look free. They are reported, not silently included.
  const notes: string[] = []
  if (res.unresolved.length > 0) {
    notes.push(
      `⚠ 以下 ${res.unresolved.length} 位喺時間表搵唔到，未計入：` +
      `${res.unresolved.map((u) => u.name ?? "—").join("、")}。` +
      "所以下面嘅結果未必包含佢哋，請提我用戶去「教師資料」設定時間表姓名。",
    )
  }
  if (res.resolved.length === 0) {
    return [`「${label}」有 ${staff.length} 位成員，但全部喺時間表搵唔到，無法計算共同空堂。`, ...notes].join("\n")
  }

  const nameOf = (id: string) => res.resolved.find((r) => r.id === id)?.name ?? "—"
  const timeOf = (p: number) => {
    const row = res.periods.find((x) => x.period === p)
    return row ? `${row.startTime}–${row.endTime}` : ""
  }

  const header  = "| 節次 | " + Array.from({ length: MAX_DAY }, (_, d) => `星期${WEEKDAY_NAMES[d + 1]}`).join(" | ") + " |"
  const divider = "|" + "---|".repeat(MAX_DAY + 1)
  const free: string[] = []
  const rows = Array.from({ length: MAX_PERIOD }, (_, i) => {
    const p = i + 1
    const cells = Array.from({ length: MAX_DAY }, (_, j) => {
      const day  = j + 1
      const busy = res.busy[slotKey(day, p)] ?? []
      if (busy.length === 0) {
        free.push(`星期${WEEKDAY_NAMES[day]}第${p}節${timeOf(p) ? `（${timeOf(p)}）` : ""}`)
        return "✓"
      }
      return `${busy.length} 人有課`
    })
    const t = timeOf(p)
    return `| 第${p}節${t ? ` ${t}` : ""} | ${cells.join(" | ")} |`
  })

  // A near miss is still useful: name who blocks the slots with only one clash.
  const nearMiss = Array.from({ length: MAX_DAY }, (_, j) => j + 1).flatMap((day) =>
    Array.from({ length: MAX_PERIOD }, (_, i) => i + 1)
      .map((p) => ({ day, p, busy: res.busy[slotKey(day, p)] ?? [] }))
      .filter((x) => x.busy.length === 1)
      .map((x) => `星期${WEEKDAY_NAMES[x.day]}第${x.p}節（只有 ${nameOf(x.busy[0])} 有課）`))

  return [
    `「${label}」共 ${res.resolved.length} 位成員（學期 ${res.term}）：${res.resolved.map((r) => r.name).join("、")}`,
    ...notes,
    "",
    header, divider, ...rows,
    "",
    free.length > 0
      ? `全員共同空堂（${free.length} 個）：${free.join("、")}`
      : "並無全員共同空堂。",
    nearMiss.length > 0 ? `只差一人嘅時段：${nearMiss.slice(0, 8).join("、")}` : "",
    "",
    "以上係系統實際時間表數據。請用上面嘅表格展示，並建議 2-3 個開會時段；",
    "如果冇全員空堂，可以建議「只差一人」嘅時段，並講明邊位有課。",
    "唔好加入任何未列出嘅時段或成員。",
  ].filter(Boolean).join("\n")
}

async function runFreeTeachers(params: Record<string, unknown>): Promise<string> {
  const day    = Number(params.day)
  const period = Number(params.period)

  if (!Number.isInteger(day) || day < 1 || day > MAX_DAY || !Number.isInteger(period) || period < 1 || period > MAX_PERIOD) {
    return `參數錯誤：day 必須為 1-${MAX_DAY}，period 必須為 1-${MAX_PERIOD}。請先問清楚用戶想查邊日邊節。`
  }

  const term = typeof params.term === "string" && params.term ? params.term : await getLatestTerm()
  if (!term) return "系統尚未上載任何時間表，請建議用戶聯絡管理員到「設定 → 時間表上載」上載 CSV。"

  const teachers = await getFreeTeachers(day, period, term)
  if (teachers.length === 0) return `查詢結果（學期 ${term}）：星期${WEEKDAY_NAMES[day]}第${period}節並無老師有空。`
  return `查詢結果（學期 ${term}）：星期${WEEKDAY_NAMES[day]}第${period}節有空嘅老師（${teachers.length} 位）：${teachers.join("、")}。如用戶係安排代課，可以將呢個名單列為候選代課老師。`
}
