import { z } from "zod";
import { parseDate } from "./model";
import { sourceFileId } from "./source-link";
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => parseDate(v, 2026) === v);
export const configSchema = z
  .object({
    spreadsheetId: z
      .string()
      .trim()
      .max(2048)
      .refine(
        (v) => sourceFileId(v) !== null,
        "請貼上有效的Google試算表／Drive檔案連結或檔案ID（不是發布到網絡的連結）",
      )
      .transform((v) => sourceFileId(v)!),
    sheetTitle: z.string().trim().min(1).max(100),
    schoolYearStart: z.number().int().min(2020).max(2100),
    enabled: z.boolean(),
    authorizeAutoApproval: z.boolean(),
    expectedVersion: z.number().int().min(0),
  })
  .strict()
  .refine(
    (v) => !v.enabled || v.authorizeAutoApproval,
    "啟用前須授權每日自動批核",
  );
export const runSchema = z
  .object({
    date: dateSchema,
    expectedHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
