import { isAdmin, isTeacherOrAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"

const committeeEnum = z.enum(["ADMIN", "DISCIPLINE", "IT", "CURRICULUM", "ECA"])
const createUserSchema = z.object({
  email:       z.string().email(),
  name:        z.string().max(100).optional(),
  role:        z.enum(["STUDENT", "TEACHER", "ADMIN"]).default("STUDENT"),
  password:    z.string().min(8).max(200).optional(),
  committees:  z.array(z.union([
    committeeEnum,
    z.object({ committee: committeeEnum, isChair: z.boolean().optional() }),
  ])).optional(),
  classCode:   z.union([z.string(), z.array(z.string())]).optional(),
  classNumber: z.union([z.string(), z.array(z.string())]).optional(),
})

// GET — list all users with committee memberships and class enrollments
// Read access is allowed for staff (teachers need the directory for
// activity/announcement targeting); mutations below are ADMIN-only.
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isTeacherOrAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const users = await prisma.user.findMany({
    select: {
      id:            true,
      name:          true,
      email:         true,
      image:         true,
      role:          true,
      createdAt:     true,
      committeeRoles: {
        select: { committee: true, isChair: true },
      },
      enrollments: {
        select: {
          classNumber: true,
          class: { select: { id: true, name: true, classCode: true } }
        }
      }
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  })

  return NextResponse.json(users)
}

// POST — create a single user
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const parsed = createUserSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 })
    }
    const { email, name, role, password, committees, classCode, classNumber } = parsed.data

    const hashedPassword = password ? await bcrypt.hash(password, 10) : null

    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        role,
        password: hashedPassword,
        committeeRoles: committees && committees.length > 0 ? {
          create: committees.map((c) =>
            typeof c === "string"
              ? { committee: c, isChair: false }
              : { committee: c.committee, isChair: c.isChair ?? false }
          )
        } : undefined
      }
    })

    if (classCode && role === "STUDENT") {
      const codes = Array.isArray(classCode) ? classCode : [classCode]
      const nums  = Array.isArray(classNumber) ? classNumber : [classNumber]
      const classes = await prisma.class.findMany({
        where: { classCode: { in: codes } }
      })
      
      if (classes.length > 0) {
        await prisma.classEnrollment.createMany({
          data: classes.map((cls, idx) => ({
            classId: cls.id,
            studentId: user.id,
            classNumber: nums[idx] || null
          }))
        })
      }
    }

    return NextResponse.json(user)
  } catch (err: any) {
    if (err.code === "P2002") {
      return NextResponse.json({ error: "Email already exists" }, { status: 400 })
    }
    console.error("User creation error:", err)
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
  }
}
