import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isTeacherOrAdmin } from "@/lib/roles"
import { requireClassAccess } from "@/lib/class-perm"
import { z } from "zod"

type Params = { params: { classId: string } }

async function gate(classId: string) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const g = await requireClassAccess(classId, session.user)
  return g instanceof NextResponse ? g : { userId: session.user.id }
}

// GET — this class's 課代表／科代表.
export async function GET(_req: NextRequest, { params }: Params) {
  const g = await gate(params.classId)
  if (g instanceof NextResponse) return g
  const reps = await prisma.classRep.findMany({
    where:   { classId: params.classId },
    select:  { id: true, subject: true, student: { select: { id: true, name: true } } },
    orderBy: [{ subject: "asc" }, { createdAt: "asc" }],
  })
  return NextResponse.json({ reps })
}

const schema = z.object({
  studentId: z.string().min(1),
  subject:   z.string().trim().max(30).default(""),   // "" = 全科
})

// POST — designate a 課代表. Must be on this class's roster.
export async function POST(req: NextRequest, { params }: Params) {
  const g = await gate(params.classId)
  if (g instanceof NextResponse) return g
  const parsed = schema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "請揀選學生" }, { status: 400 })

  const enrolled = await prisma.classEnrollment.findFirst({
    where: { classId: params.classId, studentId: parsed.data.studentId }, select: { id: true },
  })
  if (!enrolled) return NextResponse.json({ error: "此學生不在本班名單" }, { status: 400 })

  try {
    const rep = await prisma.classRep.create({
      data: { classId: params.classId, studentId: parsed.data.studentId, subject: parsed.data.subject, createdBy: g.userId },
      select: { id: true, subject: true, student: { select: { id: true, name: true } } },
    })
    return NextResponse.json(rep, { status: 201 })
  } catch (err) {
    if ((err as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "此學生已是這科的課代表" }, { status: 409 })
    }
    throw err
  }
}

// DELETE ?id= — remove a 課代表.
export async function DELETE(req: NextRequest, { params }: Params) {
  const g = await gate(params.classId)
  if (g instanceof NextResponse) return g
  const id = new URL(req.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "缺少 id" }, { status: 400 })
  await prisma.classRep.deleteMany({ where: { id, classId: params.classId } })
  return new NextResponse(null, { status: 204 })
}
