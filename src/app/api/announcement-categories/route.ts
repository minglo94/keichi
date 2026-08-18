import { isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

// The 5 committee-backed default categories. Ensured on first read so the
// PA-announcement module works even on a DB where the seed hasn't re-run.
const COMMITTEE_CATEGORIES = [
  { name: "行政",     committee: "ADMIN"      },
  { name: "訓育",     committee: "DISCIPLINE" },
  { name: "資訊科技", committee: "IT"         },
  { name: "課程發展", committee: "CURRICULUM" },
  { name: "課外活動", committee: "ECA"        },
] as const

async function ensureCommitteeCategories() {
  await Promise.all(
    COMMITTEE_CATEGORIES.map((c) =>
      prisma.announcementCategory.upsert({
        where:  { name: c.name },
        update: { committee: c.committee },
        create: { name: c.name, committee: c.committee },
      })
    )
  )
}

const createSchema = z.object({
  name: z.string().min(1).max(50),
})

// GET — committee-backed categories first, then custom ones by name.
export async function GET() {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  await ensureCommitteeCategories()

  const categories = await prisma.announcementCategory.findMany({
    orderBy: [{ committee: "asc" }, { name: "asc" }],
    select:  { id: true, name: true, committee: true },
  })

  return NextResponse.json(categories)
}

// POST — create a custom (non-committee) category.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { name } = createSchema.parse(await req.json())

  const existing = await prisma.announcementCategory.findUnique({ where: { name } })
  if (existing) return NextResponse.json({ error: "分類名稱已存在" }, { status: 409 })

  const category = await prisma.announcementCategory.create({
    data:   { name, createdById: session.user.id },
    select: { id: true, name: true, committee: true },
  })

  return NextResponse.json(category, { status: 201 })
}
