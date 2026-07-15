import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const patchSchema = z.object({
  status: z.enum(["PENDING", "CONFIRMED", "ATTENDED", "ABSENT"]),
  note:   z.string().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; studentId: string } }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const data = patchSchema.parse(await req.json())

  const updated = await prisma.activityAssignment.update({
    where: { activityId_studentId: { activityId: params.id, studentId: params.studentId } },
    data,
    include: { student: { select: { id: true, name: true, email: true } } },
  })

  return NextResponse.json(updated)
}
