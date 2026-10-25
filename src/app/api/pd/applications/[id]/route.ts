import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { pdSession } from "@/lib/pd-auth"

export async function DELETE(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const session = await pdSession()
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const app = await prisma.pdApplication.findUnique({ where: { id: params.id } })
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.pdApplication.delete({ where: { id: params.id } })
  return NextResponse.json({ deleted: true })
}
