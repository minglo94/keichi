// Shared Keida greeting — safe to import from both server and client
// (no SDK / server-only dependencies here).

export const KEIDA_GREETING = `你好！我是 Keida，基智中學的 AI 校務助理。

有什麼可以幫到你？你可以詢問我關於：
- 學校公告
- 即將舉行的活動或假期
- 學生行為記錄
- 待辦事項

請隨時提問！😊`

// Detect a bare greeting ("hi", "hello", "你好", "哈囉", etc.) so Keida can
// reply with the standard intro instead of calling the model.
export function isGreeting(text: string): boolean {
  const t = text.trim().toLowerCase().replace(/[!！。.~\s]+$/g, "")
  if (t.length === 0) return false
  const greetings = [
    "hi", "hello", "hey", "yo",
    "你好", "妳好", "您好", "哈囉", "哈佬", "哈囉keida", "hi keida", "hello keida",
    "早晨", "早安", "午安", "晚安", "在嗎", "在嗎?",
  ]
  return greetings.includes(t)
}
