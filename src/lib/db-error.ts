// Turning a schema-drift error into something an admin can act on.
//
// There are no migrations in this repo — the schema is applied with
// `prisma db push` — so a deploy can ship a Prisma Client that selects columns
// the live database doesn't have yet. That surfaces as P2021/P2022 deep inside
// a query, and without this the route just 500s and the UI renders nothing.

export function dbErrorMessage(err: unknown): string | null {
  const e = err as { code?: string; meta?: Record<string, unknown> } | null
  if (!e?.code) return null
  if (e.code === "P2022") {
    return `資料庫尚未更新：欠缺欄位「${e.meta?.column ?? "?"}」。請管理員執行 prisma db push 後再試。`
  }
  if (e.code === "P2021") {
    return `資料庫尚未更新：欠缺資料表「${e.meta?.table ?? "?"}」。請管理員執行 prisma db push 後再試。`
  }
  return null
}

/** Wrap a route body so schema drift reports itself instead of 500-ing blank. */
export async function withDbErrors<T>(fn: () => Promise<T>): Promise<T | { __error: string }> {
  try {
    return await fn()
  } catch (err) {
    const msg = dbErrorMessage(err)
    if (msg) return { __error: msg }
    throw err
  }
}
