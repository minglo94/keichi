import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isAdmin, isTeacherOrAdmin } from "@/lib/roles"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const createSchema = z.object({
  docType:   z.string().min(1).max(50),
  name:      z.string().min(1).max(100),
  content:   z.string().min(1),
  isDefault: z.boolean().default(false),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "未登入" }, { status: 401 })
  }

  const docType = req.nextUrl.searchParams.get("docType")
  const templates = await prisma.agentTemplate.findMany({
    where:   docType ? { docType } : undefined,
    orderBy: [{ docType: "asc" }, { isDefault: "desc" }, { name: "asc" }],
  })
  return NextResponse.json(templates)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: "僅管理員可管理範本" }, { status: 403 })
  }

  const data = createSchema.parse(await req.json())

  if (data.isDefault) {
    await prisma.agentTemplate.updateMany({ where: { docType: data.docType, isDefault: true }, data: { isDefault: false } })
  }

  const template = await prisma.agentTemplate.create({ data })
  return NextResponse.json(template, { status: 201 })
}
