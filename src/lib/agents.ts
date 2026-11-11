import dispatcherCharter from "../../prompts/agents/a01-dispatcher.md";
import adaCharter from "../../prompts/agents/a02-ada.md";
import ethanCharter from "../../prompts/agents/a03-ethan.md";
import carlaCharter from "../../prompts/agents/a04-carla.md";
import andyCharter from "../../prompts/agents/a05-andy.md";
import donnaCharter from "../../prompts/agents/a06-donna.md";

export type AgentKey = "dispatcher" | "ada" | "ethan" | "carla" | "andy" | "donna";

const AGENT_CHARTERS: Record<AgentKey, string> = {
  dispatcher: dispatcherCharter,
  ada:        adaCharter,
  ethan:      ethanCharter,
  carla:      carlaCharter,
  andy:       andyCharter,
  donna:      donnaCharter,
};

const AGENT_IDS: Record<AgentKey, string> = {
  dispatcher: "A01",
  ada:        "A02",
  ethan:      "A03",
  carla:      "A04",
  andy:       "A05",
  donna:      "A06",
};

export function loadCharter(agent: AgentKey): string {
  return AGENT_CHARTERS[agent];
}

export function parseRoute(text: string): AgentKey | null {
  const match = text.match(/\[ROUTE:(\w+)\]/);
  if (!match) return null;
  const key = match[1] as AgentKey;
  return key in AGENT_CHARTERS ? key : null;
}

export function parseDocReady(text: string): boolean {
  return text.includes("[DOCREADY]");
}

export function parseDocType(text: string): string {
  const match = text.match(/\[DOCTYPE:([^\]]+)\]/);
  return match ? match[1] : "文件";
}

export function parseNeedsApproval(text: string): boolean {
  return text.includes("[NEEDS_APPROVAL]");
}

export function agentId(key: AgentKey): string {
  return AGENT_IDS[key];
}

export function agentName(key: AgentKey): string {
  const names: Record<AgentKey, string> = {
    dispatcher: "統籌助手",
    ada:        "課程顧問 Ada",
    ethan:      "試卷設計師 Ethan",
    carla:      "內容製作師 Carla",
    andy:       "校務行政 Andy",
    donna:      "數據分析師 Donna",
  };
  return names[key];
}

export function parseDocTitle(text: string): string | null {
  const match = text.match(/\[TITLE:([^\]]+)\]/);
  return match ? match[1].trim() : null;
}

export interface ToolCall {
  tool:   string;
  params: Record<string, unknown>;
}

// 解析 [NEED_TOOL:tool_name]{"param":...} 標記（JSON 參數可選）
export function parseNeedTool(text: string): ToolCall | null {
  const match = text.match(/\[NEED_TOOL:(\w+)\](\s*\{[\s\S]*?\})?/);
  if (!match) return null;
  let params: Record<string, unknown> = {};
  if (match[2]) {
    try { params = JSON.parse(match[2].trim()); } catch {}
  }
  return { tool: match[1], params };
}

export function stripToolMarkers(text: string): string {
  return text.replace(/\[NEED_TOOL:\w+\](\s*\{[\s\S]*?\})?/g, "").trim();
}

// ─── Quick-create drafts ─────────────────────────────────────────────────────
// Specialists emit [DRAFT:kind]{json} to propose a record for the teacher to
// confirm on a UI card. The LLM NEVER writes to the DB — the card does an
// authenticated POST only after the teacher clicks 確認.

export const DRAFT_KINDS = [
  "todo", "announcement", "calendar", "activity", "flashcard_deck", "behavior",
] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export interface Draft {
  kind: DraftKind;
  data: Record<string, unknown>;
}

// Parse [DRAFT:kind]{...}. Returns null unless kind is in the allowlist.
export function parseDraft(text: string): Draft | null {
  const match = text.match(/\[DRAFT:(\w+)\](\s*\{[\s\S]*?\})?/);
  if (!match) return null;
  const kind = match[1] as DraftKind;
  if (!DRAFT_KINDS.includes(kind)) return null;
  let data: Record<string, unknown> = {};
  if (match[2]) {
    try { data = JSON.parse(match[2].trim()); } catch {}
  }
  return { kind, data };
}

export function stripDraftMarkers(text: string): string {
  return text.replace(/\[DRAFT:\w+\](\s*\{[\s\S]*?\})?/g, "").trim();
}

// Maps each specialist agent to the docTypes it typically produces
export const AGENT_DOC_TYPES: Partial<Record<AgentKey, string[]>> = {
  ada:   ["unit-plan", "notes", "study-plan", "event-plan"],
  ethan: ["exam", "worksheet"],
  carla: ["report", "other"],
  andy:  ["parent-notice", "dept-notice", "meeting-minutes", "event-form"],
  donna: ["report", "other"],
};

export function inferTitleFromContent(docType: string, content: string): string {
  // 優先用 [TITLE:xxx] 標記
  const tagged = parseDocTitle(content);
  if (tagged) return tagged;
  // 其次取第一個非空行，去除 Markdown 標記
  const firstLine = content
    .split("\n")
    .find((l) => l.trim() && !l.startsWith("["))
    ?.replace(/^#+\s*/, "")
    .slice(0, 60) ?? "";
  return firstLine || docType;
}
