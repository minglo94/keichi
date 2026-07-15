import { isTeacherOrAdmin, isAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { notifyMany } from "@/lib/notify"
import { classKey, isNegative, checkThresholdAndEmail, checkClassAlert, BEHAVIOR_LABEL } from "@/lib/discipline"
import type { Role } from "@prisma/client"
import { z } from "zod"

const TYPES = ["MERIT", "MISCONDUCT", "DEMERIT", "MINOR_FAULT", "MAJOR_FAULT", "LATE", "ABSENT"] as const

const createSchema = z.object({
  date:        z.string(),
  className:   z.string().min(1).max(50),
  studentName: z.string().min(1).max(100),
  type:        z.enum(TYPES),
  description: z.string().min(1),
  action:      z.string().optional(),
})

// Is this user a discipline committee member (or admin)? They see all records.
async function isDisciplineStaff(userId: string, role: Role | undefined): Promise<boolean> {
  if (isAdmin(role)) return true
  const r = await prisma.committeeRole.findFirst({ where: { userId, committee: "DISCIPLINE" } })
  return !!r
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const resolved  = searchParams.get("resolved")
  const className = searchParams.get("className")
  const type      = searchParams.get("type") as (typeof TYPES)[number] | null

  // Discipline staff + admins see all records; other teachers see their own.
  const staff = await isDisciplineStaff(session.user.id, session.user.role)

  const records = await prisma.behaviorRecord.findMany({
    where: {
      ...(staff ? {} : { authorId: session.user.id }),
      ...(resolved === "true"  ? { resolved: true  } : {}),
      ...(resolved === "false" ? { resolved: false } : {}),
      ...(className ? { className: { contains: className, mode: "insensitive" } } : {}),
      ...(type      ? { type } : {}),
    },
    orderBy: { date: "desc" },
    include: { author: { select: { id: true, name: true } } },
    take: 1000,
  })

  return NextResponse.json(records)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const data = createSchema.parse(await req.json())

  const record = await prisma.behaviorRecord.create({
    data: {
      ...data,
      classKey: classKey(data.className),
      date:     new Date(data.date),
      authorId: session.user.id,
    },
    include: { author: { select: { id: true, name: true } } },
  })

  // Negative records: notify discipline committee + admins, and run the
  // threshold check (which may email the class teacher).
  if (isNegative(data.type)) {
    try {
      const [discipline, admins] = await Promise.all([
        prisma.committeeRole.findMany({ where: { committee: "DISCIPLINE" }, select: { userId: true } }),
        prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } }),
      ])
      const ids = Array.from(new Set([
        ...discipline.map((d) => d.userId),
        ...admins.map((a) => a.id),
      ])).filter((id) => id !== session.user.id)
      await notifyMany(ids, {
        type:  "BEHAVIOR",
        title: `${BEHAVIOR_LABEL[data.type]}記錄：${data.className} ${data.studentName}`,
        body:  data.description.slice(0, 120),
        link:  "/teacher/committee/discipline/dashboard",
      })
    } catch (err) {
      console.error("behavior notify failed:", err)
    }
    await checkThresholdAndEmail(data.className, data.studentName, data.type)
    await checkClassAlert(data.className)
  }

  return NextResponse.json(record, { status: 201 })
}
