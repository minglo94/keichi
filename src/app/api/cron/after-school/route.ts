import { api } from "@/lib/after-school/http";
import { cronAuthorized } from "@/lib/after-school/auth";
import { tick } from "@/lib/after-school/scheduler";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function POST(req: Request) {
  return api(async () => {
    cronAuthorized(req);
    return tick();
  });
}
