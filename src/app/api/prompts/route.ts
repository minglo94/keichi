import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const SUBJECTS = ["LESSON", "MATERIAL", "ASSESSMENT", "FEEDBACK", "PARENT", "CLASSROOM", "ADMIN", "PD"] as const
const TYPES    = ["PLAN", "CREATE", "ASSESS", "COMMUNICATE"] as const

const createSchema = z.object({
  subject:    z.enum(SUBJECTS),
  type:       z.enum(TYPES),
  title:      z.string().min(1).max(200),
  tags:       z.array(z.string().max(30)).max(20).default([]),
  promptText: z.string().min(1).max(4000),
})

// GET — full prompt library; client filters by subject/type/search locally.
export async function GET() {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const prompts = await prisma.prompt.findMany({
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json(prompts)
}

// POST — any teacher/admin may add a prompt to the shared library.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const data = createSchema.parse(await req.json())

  const prompt = await prisma.prompt.create({
    data: { ...data, createdById: session.user.id },
    include: { createdBy: { select: { id: true, name: true } } },
  })

  return NextResponse.json(prompt, { status: 201 })
}
