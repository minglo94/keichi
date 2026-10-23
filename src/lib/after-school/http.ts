import { NextResponse } from "next/server";
import type { z } from "zod";
export class AfterSchoolError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function sameOrigin(req: Request) {
  const expected = new URL(
    process.env.AUTH_URL || process.env.NEXTAUTH_URL || req.url,
  ).origin;
  if (req.headers.get("origin") !== expected)
    throw new AfterSchoolError(403, "請由本網站操作");
}
export async function body<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<z.output<S>> {
  const reader = req.body?.getReader();
  if (!reader) throw new AfterSchoolError(400, "缺少內容");
  const chunks: Uint8Array[] = [];
  let n = 0;
  try {
    while (true) {
      const r = await reader.read();
      if (r.done) break;
      n += r.value.length;
      if (n > 65536) {
        await reader.cancel();
        throw new AfterSchoolError(413, "內容太大");
      }
      chunks.push(r.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    bytes.set(c, o);
    o += c.length;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new AfterSchoolError(400, "內容格式錯誤");
  }
  const v = schema.safeParse(value);
  if (!v.success)
    throw new AfterSchoolError(400, v.error.issues[0]?.message || "資料無效");
  return v.data;
}
export async function api(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json(await fn(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    const status =
      e instanceof AfterSchoolError
        ? e.status
        : e && typeof e === "object" && "code" in e && e.code === "P2002"
          ? 409
          : 503;
    return NextResponse.json(
      {
        error:
          e instanceof AfterSchoolError
            ? e.message
            : status === 409
              ? "其他執行已更新資料，請重新預覽"
              : "未能完成操作，請稍後再試",
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
