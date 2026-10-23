import { z } from "zod";
const id = z.string().min(1).max(128);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T12:00:00Z`);
    return !isNaN(+d) && d.toISOString().slice(0, 10) === v;
  }, "日期不存在");
const instant = z.string().datetime({ offset: true }).nullable().default(null);
const base = {
  title: z.string().trim().min(1).max(120),
  body: z.string().trim().max(3000).default(""),
  color: z.enum(["amber", "blue", "green", "rose", "white"]).default("amber"),
  pinned: z.boolean().default(false),
  subject: z.string().trim().min(1).max(60).nullable().default(null),
  startsAt: instant,
  endsAt: instant,
  link: z
    .string()
    .url()
    .max(1000)
    .refine((v) => /^https?:\/\//i.test(v))
    .nullable()
    .optional(),
};
const detention = z
  .object({
    studentNumbers: z
      .array(z.string().regex(/^\d{1,3}$/))
      .min(1)
      .max(60)
      .refine((a) => new Set(a).size === a.length),
    date,
    startTime: time,
    endTime: time,
    location: z.string().trim().min(1).max(120),
  })
  .strict()
  .refine((v) => v.endTime > v.startTime, "結束時間須遲於開始");
export const cardInputSchema = z
  .discriminatedUnion("type", [
    z
      .object({ ...base, type: z.literal("DETENTION"), payload: detention })
      .strict(),
    z
      .object({
        ...base,
        type: z.literal("MEMO"),
        payload: z.object({}).strict().default({}),
      })
      .strict(),
    z
      .object({
        ...base,
        type: z.literal("ANNOUNCEMENT"),
        payload: z.object({}).strict().default({}),
      })
      .strict(),
    z
      .object({
        ...base,
        type: z.literal("ACTIVITY"),
        payload: z
          .object({
            date,
            startTime: time,
            endTime: time,
            location: z.string().trim().min(1).max(120),
          })
          .strict()
          .refine((v) => v.endTime > v.startTime),
      })
      .strict(),
  ])
  .refine(
    (v) =>
      !v.startsAt || !v.endsAt || +new Date(v.endsAt) > +new Date(v.startsAt),
    "發布結束時間須遲於開始",
  );
export const gridItemSchema = z
  .object({
    id,
    x: z.number().int().min(0).max(11),
    y: z.number().int().min(0).max(200),
    w: z.number().int().min(2).max(12),
    h: z.number().int().min(2).max(12),
  })
  .strict()
  .refine((v) => v.x + v.w <= 12, "超出格線");
export const layoutInputSchema = z
  .object({
    items: z.array(gridItemSchema).max(100),
    expectedVersion: z.number().int().min(0),
  })
  .strict()
  .refine(
    (v) => new Set(v.items.map((x) => x.id)).size === v.items.length,
    "重複卡片",
  );
export const timetableRowSchema = z
  .object({
    id,
    day: z.number().int().min(1).max(5),
    period: z.number().int().min(0).max(10),
    label: z.string().trim().max(60).optional(),
    subject: z.string().trim().min(1).max(120),
  })
  .strict()
  .refine((v) => v.period !== 0 || !!v.label, "具名節次必須填名稱");
export const timetableInputSchema = z
  .object({
    source: z.enum(["AUTO", "MANUAL"]),
    rows: z.array(timetableRowSchema).max(200),
    expectedVersion: z.number().int().min(0),
  })
  .strict()
  .refine(
    (v) => new Set(v.rows.map((x) => x.id)).size === v.rows.length,
    "重複課堂",
  );
export const slotSchema = z
  .object({
    id,
    period: z.number().int().min(0).max(10).nullable(),
    label: z.string().trim().min(1).max(60),
    kind: z.enum(["LESSON", "BREAK", "LUNCH"]),
    startTime: time,
    endTime: time,
  })
  .strict()
  .refine((v) => v.endTime > v.startTime)
  .refine((v) => v.kind === "LESSON" || v.period === null);
export const scheduleInputSchema = z
  .object({
    slots: z.array(slotSchema).max(40),
    expectedVersion: z.number().int().min(0),
  })
  .strict()
  .superRefine((v, ctx) => {
    const sorted = [...v.slots].sort((a, b) =>
      a.startTime.localeCompare(b.startTime),
    );
    if (
      new Set(sorted.map((x) => x.id)).size !== sorted.length ||
      sorted.some((x, i) => i > 0 && x.startTime < sorted[i - 1].endTime)
    )
      ctx.addIssue({ code: "custom", message: "節次重複或時間重疊" });
    const keys = v.slots
      .filter((s) => s.kind === "LESSON")
      .map((s) => (s.period ? `p${s.period}` : `l${s.label}`));
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: "custom", message: "重複節次" });
  });
export const loginSchema = z
  .object({
    className: z.string().trim().min(1).max(60),
    password: z.string().min(1).max(128),
  })
  .strict();
export const accessInputSchema = z
  .object({
    password: z.string().min(8).max(72).optional(),
    enabled: z.boolean(),
    expectedVersion: z.number().int().min(0),
  })
  .strict();
export const cardWriteSchema = z
  .object({
    card: cardInputSchema,
    targetClassIds: z.array(id).min(1).max(200),
    expectedVersion: z.number().int().min(0).optional(),
  })
  .strict();
