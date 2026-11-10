import { auth } from "@/lib/auth"
import { stagingAuthScope } from "@/lib/staging-prisma-scope.mjs"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"

export const dynamic = "force-dynamic"

export default async function MigrationCandidate() {
  if (!stagingAuthScope()?.candidate) notFound()
  const session = await auth()
  if (!session?.user) redirect("/login")
  if (session.user.role !== "ADMIN" && session.user.role !== "TEACHER") notFound()

  return (
    <main className="mx-auto max-w-xl space-y-5 p-8">
      <h1 className="text-2xl font-semibold">基智行政平台 · 私有驗收</h1>
      <p>使用還原資料進行唯讀驗收。</p>
      <ul className="list-disc space-y-2 pl-6">
        <li><Link prefetch={false} className="underline" href="/api/classes">查看班級</Link></li>
        {session.user.role === "ADMIN" && (
          <li><Link prefetch={false} className="underline" href="/api/admin/groups">查看群組管理</Link></li>
        )}
      </ul>
    </main>
  )
}
