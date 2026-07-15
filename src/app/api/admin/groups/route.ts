import { isAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const createSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["FORM_CLASS", "SUBJECT_CLASS", "SPECIFIC"]),
  description: z.string().optional(),
  teacherId: z.string().nullable().optional(),
})

export async function GET() {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const groups = await prisma.studentGroup.findMany({
    include: {
      _count: { select: { members: true } },
      teacher: { select: { id: true, name: true, image: true, email: true } },
    },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  })

  return NextResponse.json(groups)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const data = createSchema.parse(await req.json())
  const group = await prisma.studentGroup.create({
    data,
    include: {
      teacher: { select: { id: true, name: true, image: true, email: true } },
    },
  })

  return NextResponse.json(group, { status: 201 })
}
