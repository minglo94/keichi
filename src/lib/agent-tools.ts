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

export async function runAgentTool(call: ToolCall): Promise<string> {
  try {
    switch (call.tool) {
      case "timetable_query": return await runTimetableQuery(call.params)
      case "free_teachers":   return await runFreeTeachers(call.params)
      default:
        return `工具「${call.tool}」不存在。可用工具：timetable_query（夾空堂）、free_teachers（找空堂老師）。`
    }
  } catch (err) {
    console.error("[agent-tools]", call.tool, err)
    return "工具執行失敗（系統錯誤），請向用戶道歉並建議稍後再試。"
  }
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
