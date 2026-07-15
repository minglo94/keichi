import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const joinSchema = z.object({ classCode: z.string().length(6) })

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || session.user.role !== "STUDENT") {
    return NextResponse.json({ error: "Students only" }, { status: 403 })
  }

  const { classCode } = joinSchema.parse(await req.json())

  const targetClass = await prisma.class.findUnique({ where: { classCode: classCode.toUpperCase() } })
  if (!targetClass) {
    return NextResponse.json({ error: "Class not found" }, { status: 404 })
  }

  const existing = await prisma.classEnrollment.findUnique({
    where: { classId_studentId: { classId: targetClass.id, studentId: session.user.id } },
  })
  if (existing) {
    return NextResponse.json({ error: "Already enrolled" }, { status: 409 })
  }

  const enrollment = await prisma.classEnrollment.create({
    data: { classId: targetClass.id, studentId: session.user.id },
  })

  return NextResponse.json({ enrollment, class: targetClass }, { status: 201 })
}
