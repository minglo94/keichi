import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET — recent notifications + unread count for the current user.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const limit = Math.min(Number(new URL(req.url).searchParams.get("limit") ?? 20), 50)

  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where:   { userId: session.user.id },
      orderBy: { createdAt: "desc" },
      take:    limit,
    }),
    prisma.notification.count({ where: { userId: session.user.id, read: false } }),
  ])

  return NextResponse.json({ items, unread })
}
