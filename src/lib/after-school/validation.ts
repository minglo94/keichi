import { z } from "zod";
import { parseDate } from "./model";
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => parseDate(v, 2026) === v);
export const configSchema = z
  .object({
    spreadsheetId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/),
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
