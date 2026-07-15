import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const patchSchema = z.object({
  title:       z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  committee:   z.enum(["ADMIN", "DISCIPLINE", "IT", "CURRICULUM", "ECA"]).optional(),
  dueDate:     z.string().datetime().nullable().optional(),
  assigneeIds: z.array(z.string()).optional(),
  status:      z.enum(["OPEN", "IN_PROGRESS", "DONE"]).optional(),
})

const assigneesInclude = {
  assignees: { include: { user: { select: { id: true, name: true, image: true } } } },
  createdBy: { select: { id: true, name: true } },
} as const

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const todo = await prisma.todo.findUnique({
    where: { id: params.id },
    include: assigneesInclude,
  })
  if (!todo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isOwner    = todo.createdById === session.user.id
  const isAssignee = todo.assignees.some((a) => a.userId === session.user.id)
  if (!isOwner && !isAssignee) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  return NextResponse.json(todo)
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const todo = await prisma.todo.findUnique({
    where: { id: params.id },
    include: { assignees: true },
  })
  if (!todo) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const isOwner    = todo.createdById === session.user.id
  const isAssignee = todo.assignees.some((a) => a.userId === session.user.id)
  if (!isOwner && !isAssignee) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { assigneeIds, dueDate, ...rest } = patchSchema.parse(await req.json())

  // Assignees can only update status
  if (!isOwner && isAssignee) {
    if (!rest.status) return NextResponse.json({ error: "Assignees may only update status" }, { status: 400 })
    const updated = await prisma.todo.update({
      where: { id: params.id },
      data:  { status: rest.status },
      include: assigneesInclude,
    })
    return NextResponse.json(updated)
  }

  const updated = await prisma.todo.update({
    where: { id: params.id },
    data: {
      ...rest,
      dueDate: dueDate !== undefined
        ? (dueDate === null ? null : new Date(dueDate))
        : undefined,
      ...(assigneeIds !== undefined ? {
        assignees: {
          deleteMany: {},
          create: assigneeIds.map((userId) => ({ userId })),
        },
      } : {}),
    },
    include: assigneesInclude,
  })

  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const todo = await prisma.todo.findUnique({ where: { id: params.id } })
  if (!todo) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (todo.createdById !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  await prisma.todo.delete({ where: { id: params.id } })

  return NextResponse.json({ deleted: true })
}
