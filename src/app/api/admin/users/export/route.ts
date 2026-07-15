import { isAdmin } from "@/lib/roles"
import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const users = await prisma.user.findMany({
    select: {
      email:          true,
      name:           true,
      role:           true,
      committeeRoles: { select: { committee: true, isChair: true } },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  })

  const lines: string[] = ["email,name,role,committees,chairOf"]

  for (const u of users) {
    const committees = u.committeeRoles.map((r) => r.committee).join("|")
    const chairOf    = u.committeeRoles.filter((r) => r.isChair).map((r) => r.committee).join("|")
    const name       = (u.name ?? "").replace(/,/g, "，")
    lines.push(`${u.email ?? ""},${name},${u.role},${committees},${chairOf}`)
  }

  const csv = lines.join("\n")

  return new NextResponse(csv, {
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="users.csv"`,
    },
  })
}
