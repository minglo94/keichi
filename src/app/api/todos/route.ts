import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const createSchema = z.object({
  title:       z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  committee:   z.enum(["ADMIN", "DISCIPLINE", "IT", "CURRICULUM", "ECA"]).optional(),
  dueDate:     z.string().datetime().optional(),
  assigneeIds: z.array(z.string()).default([]),
  classId:     z.string().optional(),
  status:      z.enum(["OPEN", "IN_PROGRESS", "DONE"]).default("OPEN"),
})

const assigneesInclude = {
  assignees: { include: { user: { select: { id: true, name: true, image: true } } } },
  createdBy: { select: { id: true, name: true } },
} as const

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  
  const { searchParams } = new URL(req.url)
  const status    = searchParams.get("status") as "OPEN" | "IN_PROGRESS" | "DONE" | null
  const committee = searchParams.get("committee") as "ADMIN" | "DISCIPLINE" | "IT" | "CURRICULUM" | "ECA" | null
  const view      = searchParams.get("view") // "mine" | "assigned" | null (all)

  const statusFilter    = status    ? { status }    : {}
  const committeeFilter = committee ? { committee } : {}

  let whereClause: any = {}

  // STUDENT 只能看見分配給自己的待辦；TEACHER / ADMIN（教職員）則看自己建立或分配給自己的
  const isStaff = isTeacherOrAdmin(session.user.role)

  if (isStaff) {
    if (view === "mine") {
      whereClause = { createdById: session.user.id, ...statusFilter, ...committeeFilter }
    } else if (view === "assigned") {
      whereClause = {
        assignees: { some: { userId: session.user.id } },
        ...statusFilter,
        ...committeeFilter,
      }
    } else {
      whereClause = {
        OR: [
          { createdById: session.user.id },
          { assignees: { some: { userId: session.user.id } } },
        ],
        ...statusFilter,
        ...committeeFilter,
      }
    }
  } else {
    // STUDENT: only see what's assigned to them
    whereClause = {
      assignees: { some: { userId: session.user.id } },
      ...statusFilter,
    }
  }

  const todos = await prisma.todo.findMany({
    where: whereClause,
    include: assigneesInclude,
    orderBy: [{ dueDate: "asc" }],
  })

  return NextResponse.json(todos)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role) && session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json()
  const { assigneeIds, dueDate, classId, ...rest } = createSchema.parse(body)

  let finalAssigneeIds = [...assigneeIds]
  if (classId) {
    const enrollments = await prisma.classEnrollment.findMany({
      where: { classId },
      select: { studentId: true }
    })
    finalAssigneeIds = Array.from(new Set([...finalAssigneeIds, ...enrollments.map(e => e.studentId)]))
  }

  const todo = await prisma.todo.create({
    data: {
      ...rest,
      dueDate:    dueDate ? new Date(dueDate) : undefined,
      createdById: session.user.id,
      assignees: finalAssigneeIds.length > 0
        ? { create: finalAssigneeIds.map((userId) => ({ userId })) }
        : undefined,
    },
    include: assigneesInclude,
  })

  return NextResponse.json(todo, { status: 201 })
}
