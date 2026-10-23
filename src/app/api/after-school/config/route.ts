import { api, body, sameOrigin } from "@/lib/after-school/http";
import { actor } from "@/lib/after-school/auth";
import { prisma } from "@/lib/prisma";
import { configSchema } from "@/lib/after-school/validation";
import { readiness, saveConfig } from "@/lib/after-school/settings";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => {
    const user = await actor();
    return {
      config: await prisma.afterSchoolConfig.findUnique({
        where: { key: "school" },
      }),
      readiness: readiness(),
      isAdmin: user.isAdmin,
    };
  });
}
export async function PUT(req: Request) {
  return api(async () => {
    sameOrigin(req);
    const a = await actor(true);
    return saveConfig(await body(req, configSchema), a.id);
  });
}
