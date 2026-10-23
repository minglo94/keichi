import { api, body, sameOrigin } from "@/lib/after-school/http";
import { actor } from "@/lib/after-school/auth";
import { previewDay } from "@/lib/after-school/service";
import { dateSchema } from "@/lib/after-school/validation";
import { z } from "zod";
export async function POST(req: Request) {
  return api(async () => {
    sameOrigin(req);
    await actor();
    const v = await body(req, z.object({ date: dateSchema }).strict());
    const p = await previewDay(v.date);
    return { ...p, rows: p.rows.map(({ studentId, ...rest }) => rest) };
  });
}
