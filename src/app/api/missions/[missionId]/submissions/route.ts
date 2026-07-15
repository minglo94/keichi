import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type RouteParams = { params: { missionId: string } }

// GET — list submissions for a mission (teacher only, sorted by AI score desc)
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const submissions = await prisma.missionSubmission.findMany({
    where: { missionId: params.missionId },
    include: { student: { select: { id: true, name: true, image: true } } },
    orderBy: [
      { status: "asc" },
      { aiScore: "desc" },
    ],
  })

  return NextResponse.json(submissions)
}
