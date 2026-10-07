import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { hkSchoolYear } from "@/lib/hk-date"
import { dbErrorMessage } from "@/lib/db-error"

// GET — the student's own 課堂紀錄 for this school year.
//
// Joined by student id, so unlike behaviour records there's no name matching
// to get wrong. 課堂表現 appears only once the teacher has 發放 it: pending
// performance can still be edited or deleted during the lesson, and a student
// shouldn't watch a +1 appear and vanish.
export async function GET() {
  const session = await auth()
  if (!session?.user || session.user.role !== "STUDENT") {
    return NextResponse.json({ error: "Students only" }, { status: 403 })
  }
  try {
    const records = await prisma.lessonRecord.findMany({
      where: {
        studentId: session.user.id,
        date: { gte: hkSchoolYear().start },
        OR: [{ kind: { not: "PERFORMANCE" } }, { awardedAt: { not: null } }],
      },
      select: {
        id: true, kind: true, date: true, subject: true, tag: true, note: true, points: true, resolved: true,
        class: { select: { name: true } }, homework: { select: { title: true } },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 300,
    })
    return NextResponse.json({ records })
  } catch (err) {
    const msg = dbErrorMessage(err)
    return NextResponse.json({ error: msg ?? "未能載入課堂紀錄" }, { status: msg ? 503 : 500 })
  }
}
