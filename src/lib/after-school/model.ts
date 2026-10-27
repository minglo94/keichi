import { hkYmd, hkHm, hkWeekday } from "../hk-date";
export const TYPES = {
  TOOL_UP: { title: "Tool Up Class / 功課輔導班", location: "303室" },
  POSITIVE: { title: "正向班", location: "304室" },
} as const;
export type GroupType = keyof typeof TYPES;
export type Participant = {
  className: string;
  number: string;
  type: GroupType;
};
export type ResolvedParticipant = Participant & { studentId: string; makeupFrom?: string };
export type Stage = "MORNING" | "AFTERNOON";
export function scheduleFor(date: string) {
  const day = hkWeekday(date);
  return day === 0 || day === 6
    ? null
    : day === 1
      ? { start: "15:30", end: "16:30", remind: "14:00" }
      : { start: "16:00", end: "17:00", remind: "15:45" };
}
export function instant(date: string, time: string) {
  return new Date(`${date}T${time}:00+08:00`);
}
export function dueStages(date: string, now: Date): Stage[] {
  const s = scheduleFor(date);
  if (!s || hkYmd(now) !== date || now >= instant(date, s.start)) return [];
  if (now >= instant(date, s.remind)) return ["AFTERNOON"];
  return now >= instant(date, "08:15") ? ["MORNING"] : [];
}
export function normalizeClass(v: unknown) {
  return String(v ?? "")
    .trim()
    .toUpperCase()
    .replace(/^(?:F\.?|S)(?=\d)/, "");
}
export function normalizeNumber(v: unknown) {
  const s = String(v ?? "")
    .trim()
    .replace(/^#/, "");
  return /^\d{1,3}$/.test(s) && Number(s) > 0
    ? String(Number(s)).padStart(2, "0")
    : null;
}
function realDate(y: number, m: number, d: number) {
  const value = new Date(Date.UTC(y, m - 1, d));
  return value.getUTCFullYear() === y &&
    value.getUTCMonth() === m - 1 &&
    value.getUTCDate() === d
    ? value.toISOString().slice(0, 10)
    : null;
}
export function parseDate(v: unknown, year: number): string | null {
  if (v instanceof Date) return isNaN(+v) ? null : v.toISOString().slice(0, 10);
  if (typeof v === "number")
    return Number.isFinite(v) && v > 0 && v < 100000
      ? new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000)
          .toISOString()
          .slice(0, 10)
      : null;
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if (m) return realDate(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2}|\d{4}))?$/);
  if (!m) return null;
  const month = +m[2];
  return realDate(
    m[3]
      ? m[3].length === 2
        ? 2000 + +m[3]
        : +m[3]
      : month >= 9
        ? year
        : year + 1,
    month,
    +m[1],
  );
}
const typeOf = (v: unknown): GroupType | null => {
  const s = String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (
    [
      "tool up / 功課班",
      "tool up class / 功課輔導班",
      "功課班",
      "功課輔導班",
      "tool up class",
    ].includes(s)
  )
    return "TOOL_UP";
  return s === "正向班" ? "POSITIVE" : null;
};
export function parseRows(values: unknown[][], date: string, year: number) {
  const errors: string[] = [];
  const rows: Participant[] = [];
  if (values.length > 50001)
    return { rows, errors: ["來源超過50000行，請按學年分表"] };
  const h = (values[0] || []).map((v) => String(v ?? "").trim());
  const col = (name: string) => h.indexOf(name);
  if (["班別", "學號", "日期", "類型"].some((n) => col(n) < 0))
    return { rows, errors: ["缺少班別、學號、日期或類型表頭"] };
  const seen = new Set<string>();
  const groups = new Map<string, GroupType>();
  values.slice(1).forEach((r, i) => {
    const get = (n: string) => r[col(n)];
    if (
      ["班別", "學號", "姓名", "日期"].every(
        (n) => get(n) == null || get(n) === "",
      )
    )
      return;
    const d = parseDate(get("日期"), year);
    if (!d) {
      errors.push(`第${i + 2}行日期缺少或無效`);
      return;
    }
    if (d !== date) return;
    const className = normalizeClass(get("班別"));
    const number = normalizeNumber(get("學號"));
    const type = typeOf(get("類型"));
    if (!/^[1-9][A-Z]$/.test(className) || !number || !type) {
      errors.push(`第${i + 2}行班別、學號或課後班類型無效`);
      return;
    }
    const key = `${className}#${number}`;
    if (groups.has(key) && groups.get(key) !== type) {
      errors.push(`${className} #${number} 同時出現於兩類課後班`);
      return;
    }
    groups.set(key, type);
    if (!seen.has(`${type}:${key}`)) {
      rows.push({ className, number, type });
      seen.add(`${type}:${key}`);
    }
  });
  rows.sort(
    (a, b) =>
      a.type.localeCompare(b.type) ||
      a.className.localeCompare(b.className, undefined, { numeric: true }) ||
      +a.number - +b.number,
  );
  if (rows.length > 1000) errors.push("當日名單超過1000人，請由管理員處理");
  return { rows, errors };
}
export function formatAnnouncement(
  date: string,
  rows: Participant[],
  names?: ReadonlyMap<string, string | null>,
) {
  const s = scheduleFor(date);
  if (!s) throw new Error("週末不安排課後班");
  const [, m, d] = date.split("-");
  const title = `${+d}/${+m} 課後班名單`;
  const intro = `請以下同學於${s.start === "15:30" ? "3:30" : "4:00"} pm 放學後, 到以下地點出席課後班。如與其他活動時間重疊，請優先出席課後班。`;
  const sections = (Object.keys(TYPES) as GroupType[]).map((type) => {
    const classes = new Map<string, string[]>();
    rows
      .filter((r) => r.type === type)
      .forEach((r) =>
        classes.set(r.className, [
          ...(classes.get(r.className) || []),
          names
            ? (() => {
                const name = names.get(`${r.className}#${r.number}`)
                  ?.replace(/\s+/g, " ").trim();
                return `#${r.number}${name ? ` ${name}` : "（姓名未設定）"}`;
              })()
            : r.number,
        ]),
      );
    return `${TYPES[type].title} (${TYPES[type].location})\n${
      classes.size
        ? Array.from(classes)
            .map(([name, n]) => `${name} ${names ? "" : "#"}${n.join("、")}`)
            .join("\n")
        : "（今日沒有安排）"
    }`;
  });
  return { title, body: `${intro}\n\n${sections.join("\n\n")}` };
}
export function currentPhase(now: Date) {
  return { date: hkYmd(now), time: hkHm(now) };
}



