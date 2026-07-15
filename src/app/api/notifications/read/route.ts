import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const schema = z.object({
  id:  z.string().optional(),  // mark one read; omit to mark all read
  all: z.boolean().optional(),
})

// POST — mark one notification (id) or all as read for the current user.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id, all } = schema.parse(await req.json().catch(() => ({})))

  if (id && !all) {
    await prisma.notification.updateMany({
      where: { id, userId: session.user.id },
      data:  { read: true },
    })
  } else {
    await prisma.notification.updateMany({
      where: { userId: session.user.id, read: false },
      data:  { read: true },
    })
  }

  return NextResponse.json({ ok: true })
}
