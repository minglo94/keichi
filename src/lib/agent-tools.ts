import type { ToolCall } from "@/lib/agents"
import {
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
import { searchSchoolData, formatSearchResults } from "@/lib/agent-search"
import { hybridSearch, formatRetrievedChunks } from "@/lib/knowledge-base"
import { prisma } from "@/lib/prisma"

export async function runAgentTool(call: ToolCall, userId: string): Promise<string> {
  try {
    switch (call.tool) {
      case "timetable_query":       return await runTimetableQuery(call.params)
      case "free_teachers":         return await runFreeTeachers(call.params)
      case "search_school_data":    return await runSearchSchoolData(call.params, userId)
      case "search_knowledge_base": return await runSearchKnowledgeBase(call.params, userId)
      case "get_student_profile":   return await runGetStudentProfile(call.params)
      default:
        return `工具「${call.tool}」不存在。可用工具：timetable_query（夾空堂）、free_teachers（找空堂老師）、search_school_data（搜尋學校紀錄：公告/行為記錄/行事曆/待辦/活動/AI 生成文件）、search_knowledge_base（語義搜尋已上載嘅教材/文件內容）、get_student_profile（學生學習概況：平均分/強弱範疇）。`
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

async function runSearchSchoolData(params: Record<string, unknown>, userId: string): Promise<string> {
  const query = typeof params.query === "string" ? params.query.trim() : ""
  if (!query) return "缺少 query 參數。請先問清楚用戶想搜尋咩，再重新調用（例如學生姓名、活動名稱、關鍵字）。"

  const results = await searchSchoolData(query, userId)
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
