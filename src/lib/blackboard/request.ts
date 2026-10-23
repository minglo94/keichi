import { NextResponse } from "next/server";
import type { z } from "zod";
export class BoardError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const expected = new URL(
    process.env.AUTH_URL || process.env.NEXTAUTH_URL || req.url,
  ).origin;
  if (!origin || origin !== expected)
    throw new BoardError(403, "請由本網站操作");
}
export async function readBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<z.output<S>> {
  if (Number(req.headers.get("content-length") || 0) > 65536)
    throw new BoardError(413, "內容太大");
  const reader = req.body?.getReader();
  if (!reader) throw new BoardError(400, "缺少內容");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65536) {
        await reader.cancel();
        throw new BoardError(413, "內容太大");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new BoardError(400, "內容格式錯誤");
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new BoardError(
      400,
      parsed.error.issues[0]?.message || "內容格式錯誤",
    );
  return parsed.data;
}
export async function boardApi(fn: () => Promise<unknown>) {
  try {
    return NextResponse.json(await fn(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && e.code === "P2002")
      return NextResponse.json(
        { error: "內容已由其他老師更新，請重新載入", code: "VERSION_CONFLICT" },
        { status: 409, headers: { "Cache-Control": "no-store" } },
      );
    if (e instanceof BoardError)
      return NextResponse.json(
        { error: e.message },
        { status: e.status, headers: { "Cache-Control": "no-store" } },
      );
    console.error("[blackboard]", e instanceof Error ? e.name : "unknown");
    return NextResponse.json(
      { error: "未能連線，請稍後重試" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
