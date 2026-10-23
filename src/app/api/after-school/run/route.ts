import { api, body, sameOrigin } from "@/lib/after-school/http";
import { actor } from "@/lib/after-school/auth";
import { prepareDay } from "@/lib/after-school/service";
import { runSchema } from "@/lib/after-school/validation";
export async function POST(req: Request) {
  return api(async () => {
    sameOrigin(req);
    const a = await actor();
    const v = await body(req, runSchema);
    return prepareDay(v.date, a.id, { expectedHash: v.expectedHash });
  });
}
