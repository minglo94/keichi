import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// GET — a student's own behavior records.
// NOTE: BehaviorRecord stores studentName as a free-text string (not a user FK),
// so records are matched by the student's display name. If a student shares a
// name with another, matching is imperfect — a future schema change linking
// records to a studentId would make this exact.
export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== "STUDENT") {
    return NextResponse.json({ error: "Students only" }, { status: 403 })
  }

  const me = await prisma.user.findUnique({
    where:  { id: session.user.id },
    select: { name: true },
  })

  if (!me?.name) return NextResponse.json({ records: [], note: "NO_NAME" })

  const records = await prisma.behaviorRecord.findMany({
    where:   { studentName: { equals: me.name, mode: "insensitive" } },
    orderBy: { date: "desc" },
    select: {
      id: true, date: true, className: true, type: true,
      description: true, action: true, resolved: true,
    },
  })

  return NextResponse.json({ records })
}
