// ============================================================
// Claude API Utility
// Quiz generation (Sonnet) + Prompt evaluation (Haiku)
// ============================================================
import Anthropic from "@anthropic-ai/sdk";
import { KEIDA_GREETING, isGreeting } from "@/lib/keida-greeting";
import type {
  AiQuizMissionContent,
  PromptMissionContent,
  AiQuizGenerationResponse,
  PromptEvaluationResponse,
} from "@/types/mission";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
});

// ─────────────────────────────────────────
// QUIZ GENERATION — claude-3-5-sonnet-latest
// Teacher-triggered, quality over speed
// ─────────────────────────────────────────

const QUIZ_SYSTEM_PROMPT = `你是一位香港中學教師的 AI 助理，專門根據提供的教學材料生成練習題目。

規則：
1. 只以繁體中文出題，適合香港中學生程度
2. 每題必須有 4 個選項（A/B/C/D），只有一個正確答案
3. 解釋需簡潔清晰，50 字以內
4. 嚴格按指定 JSON 格式輸出，不要有任何前言或後記
5. 若輸入材料與教學無關（如個人資料、暴力、色情），輸出 {"error": "CONTENT_UNSAFE"}

輸出格式（JSON only）：
{
  "questions": [
    {
      "id": "q1",
      "question": "問題內容",
      "options": ["選項A", "選項B", "選項C", "選項D"],
      "answer": 0,
      "explanation": "答案解釋",
      "difficulty": "BASIC"
    }
  ]
}`;

export async function generateQuiz(
  sourceText: string,
  count: number = 5,
  difficulty: "BASIC" | "ADVANCED" | "CHALLENGE" = "BASIC",
): Promise<AiQuizGenerationResponse> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2000,
    system: QUIZ_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `請根據以下材料，生成 ${count} 條${difficulty === "BASIC" ? "基礎" : difficulty === "ADVANCED" ? "進階" : "挑戰"}程度的選擇題：\n\n${sourceText}`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  // Strip markdown fences if model accidentally includes them
  const clean = text.replace(/```json\n?|```\n?/g, "").trim();

  const parsed = JSON.parse(clean);

  if (parsed.error === "CONTENT_UNSAFE") {
    throw new Error("CONTENT_UNSAFE");
  }

  return parsed as AiQuizGenerationResponse;
}

// ─────────────────────────────────────────
// PROMPT EVALUATION — claude-3-haiku-20240307
// Student-triggered, speed is critical
// ─────────────────────────────────────────

function buildEvaluationSystemPrompt(rubric: string, studentProfileSummary?: string): string {
  const profileBlock = studentProfileSummary
    ? `\n\n該學生嘅學習概況（供你調整反饋深淺，唔好喺 feedback 度直接提及呢個概況本身）：\n${studentProfileSummary}\n`
    : "";

  return `你是一位評估學生 Prompt Engineering 技巧的 AI 評分員。

評分標準（由老師設定）：
${rubric}
${profileBlock}
評分維度（每項 0-25 分，共 100 分）：
- clarity（清晰度）：指令是否明確無歧義
- completeness（完整性）：是否包含必要的背景和限制條件
- structure（結構性）：是否運用 Role/Task/Format 等結構化技巧
- creativity（創意性）：是否有獨到的引導方式或技巧

規則：
1. 若輸入包含不雅、暴力、個人資料等內容，回傳 {"safe": false, "reason": "原因"}
2. 否則給出評分，feedback 不超過 80 字，使用繁體中文
3. 只輸出 JSON，不要前言後記

輸出格式：
{
  "safe": true,
  "score": 75,
  "breakdown": { "clarity": 20, "completeness": 18, "structure": 22, "creativity": 15 },
  "feedback": "指令結構清晰，但缺乏具體的輸出格式說明。建議加入「請以條列式列出」等格式要求。"
}`;
}

export async function evaluatePrompt(
  studentPrompt: string,
  missionContent: PromptMissionContent,
  studentProfileSummary?: string,
): Promise<PromptEvaluationResponse> {
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: buildEvaluationSystemPrompt(missionContent.rubric, studentProfileSummary),
    messages: [
      {
        role: "user",
        content: `任務情境：${missionContent.scenario}\n\n學生撰寫的 Prompt：\n${studentPrompt}`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";
  const clean = text.replace(/```json\n?|```\n?/g, "").trim();

  return JSON.parse(clean) as PromptEvaluationResponse;
}

// ─────────────────────────────────────────
// QUOTATION OCR — vision extraction of a supplier quotation image/PDF
// Ported 1:1 from KCquotation/ocr_extract.py (same prompt + JSON schema).
// ─────────────────────────────────────────

export type QuotationOcrItem = {
  name: string | null;
  qty: number | null;
  unit_price: number | null;
  subtotal: number | null;
};

export type QuotationOcrResult = {
  supplier_name: string | null;
  supplier_tel: string | null;
  quotation_date: string | null;
  items: QuotationOcrItem[];
  total: number | null;
  currency: string | null;
  notes: string | null;
};

const QUOTATION_OCR_PROMPT = `你是一個採購文件助手。請仔細分析這份供應商報價單（圖片或 PDF），提取以下資訊並以 JSON 格式回傳：

{
  "supplier_name": "供應商公司名稱",
  "supplier_tel": "電話號碼",
  "quotation_date": "報價日期 (YYYY-MM-DD 格式，如無法確定則填 null)",
  "items": [
    {
      "name": "物品名稱/規格",
      "qty": 數量 (整數),
      "unit_price": 單價 (數字，不含貨幣符號),
      "subtotal": 小計 (數字，如沒有則填 null)
    }
  ],
  "total": 總價 (數字，不含貨幣符號),
  "currency": "貨幣 (通常為 HKD)",
  "notes": "備註或其他重要資訊（如有）"
}

規則：
1. 數字只填數字，不含 $、HKD、逗號等符號
2. 如某欄位在圖片中找不到，填 null
3. 只回傳 JSON，不要任何解釋文字`;

export async function extractQuotationFromImage(
  imageBytes: Buffer,
  mediaType: string,
): Promise<QuotationOcrResult> {
  const fileB64 = imageBytes.toString("base64");

  // PDFs are sent as a "document" block; images as an "image" block.
  // The SDK narrows media_type to a literal, so we branch and annotate.
  type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  const fileBlock: Anthropic.ContentBlockParam =
    mediaType === "application/pdf"
      ? {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: fileB64,
          },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType as ImageMime,
            data: fileB64,
          },
        };

  const message = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [fileBlock, { type: "text", text: QUOTATION_OCR_PROMPT }],
      },
    ],
  });

  const textBlock = message.content.find(
    (c): c is Anthropic.TextBlock => c.type === "text",
  );
  const raw = textBlock?.text ?? "";
  const clean = raw.replace(/```json\n?|```\n?/g, "").trim();
  return JSON.parse(clean) as QuotationOcrResult;
}

// ─────────────────────────────────────────
// KEIDA QUERY — claude-3-5-sonnet-latest
// Teacher-facing contextual Q&A over school data
// ─────────────────────────────────────────

const KEIDA_SYSTEM_PROMPT = `你是「Keida」，中華基督教會基智中學的 AI 校務助理。
你根據學校公告記錄、學生行為記錄、行事曆事件、待辦事項及活動指派，以繁體中文回答老師的問題。

規則：
1. 只根據提供的記錄作答，不要捏造資料
2. 若記錄中找不到相關資訊，直接說明
3. 回答簡潔清晰，可用條列式
4. 涉及個別學生時，謹慎表述，只引用記錄中已有的事實
5. 優先處理與當前日期相關或標註為緊急的事項`;

type KEIDAAnnouncement = {
  title: string;
  body: string;
  target: string;
  committee: string | null;
  priority: string;
  createdAt: Date;
  author: { name: string | null };
};

type KEIDABehaviorRecord = {
  date: Date;
  className: string;
  studentName: string;
  type: string;
  description: string;
  action: string | null;
  resolved: boolean;
};

type KEIDACalendarEvent = {
  title: string;
  startDate: Date;
  endDate: Date | null;
  allDay: boolean;
  description: string | null;
  committee: string | null;
};

type KEIDATodo = {
  title: string;
  description: string | null;
  status: string;
  dueDate: Date | null;
  committee: string | null;
};

type KEIDAActivity = {
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date | null;
  location: string | null;
  assignments: { student: { name: string | null }; status: string }[];
};

export async function queryKeida(
  query: string,
  announcements: KEIDAAnnouncement[],
  behaviorRecords: KEIDABehaviorRecord[],
  calendarEvents: KEIDACalendarEvent[] = [],
  todos: KEIDATodo[] = [],
  activities: KEIDAActivity[] = [],
): Promise<string> {
  // Bare greetings get the standard intro — no model call needed
  if (isGreeting(query)) {
    return KEIDA_GREETING;
  }

  const annLines =
    announcements.length > 0
      ? announcements
          .map((a) => {
            const date = new Date(a.createdAt).toLocaleDateString("zh-HK");
            const badge =
              a.priority !== "NORMAL"
                ? `【${a.priority === "URGENT" ? "緊急" : "重要"}】`
                : "";
            const scope = a.committee ? ` (${a.committee})` : ` (${a.target})`;
            return `[公告][${date}]${badge} ${a.title}${scope}\n${a.body}`;
          })
          .join("\n\n")
      : "（無公告記錄）";

  const bhrLines =
    behaviorRecords.length > 0
      ? behaviorRecords
          .map((r) => {
            const date = new Date(r.date).toLocaleDateString("zh-HK");
            const kind = r.type === "MISCONDUCT" ? "違規" : "嘉許";
            const followUp = r.action ? ` → 跟進：${r.action}` : "";
            const status = r.resolved ? " ✓已處理" : "";
            return `[行為][${date}] ${r.className} · ${r.studentName} · ${kind}：${r.description}${followUp}${status}`;
          })
          .join("\n")
      : "（無行為記錄）";

  const calLines =
    calendarEvents.length > 0
      ? calendarEvents
          .map((e) => {
            const start = new Date(e.startDate).toLocaleString("zh-HK");
            const end = e.endDate
              ? ` 至 ${new Date(e.endDate).toLocaleString("zh-HK")}`
              : "";
            const scope = e.committee ? ` [${e.committee}]` : "";
            return `[行事曆] ${start}${end}${scope}：${e.title}${e.description ? ` (${e.description})` : ""}`;
          })
          .join("\n")
      : "（無即將行事曆事件）";

  const todoLines =
    todos.length > 0
      ? todos
          .map((t) => {
            const due = t.dueDate
              ? ` (期限：${new Date(t.dueDate).toLocaleDateString("zh-HK")})`
              : "";
            const scope = t.committee ? ` [${t.committee}]` : "";
            return `[待辦] ${t.title}${due}${scope} - 狀態：${t.status}`;
          })
          .join("\n")
      : "（無進行中待辦事項）";

  const actLines =
    activities.length > 0
      ? activities
          .map((a) => {
            const time = new Date(a.startTime).toLocaleString("zh-HK");
            const students = a.assignments
              .map((as) => `${as.student.name}(${as.status})`)
              .join(", ");
            return `[活動] ${time} · ${a.title}${a.location ? ` @ ${a.location}` : ""}\n  指派學生：${students}`;
          })
          .join("\n")
      : "（無即將活動指派）";

  const context = `
當前日期：${new Date().toLocaleDateString("zh-HK")}

--- 公告記錄 ---
${annLines}

--- 行為記錄 ---
${bhrLines}

--- 行事曆事件 ---
${calLines}

--- 待辦事項 ---
${todoLines}

--- 活動指派 ---
${actLines}
`.trim();

  console.log(
    `[queryKeida] Context size: ${context.length} chars. Query: ${query}`,
  );

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1000,
      system: KEIDA_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `以下是學校的最新數據上下文：\n\n${context}\n\n我的問題：${query}`,
        },
      ],
    });

    return message.content[0].type === "text" ? message.content[0].text : "";
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("Claude API Error (queryKeida):", msg);
    throw new Error(`AI 服務錯誤：${msg}`);
  }
}
