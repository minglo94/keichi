import { isAdmin } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"

type CommitteeType = "ADMIN" | "DISCIPLINE" | "IT" | "CURRICULUM" | "ECA"
type Role = "TEACHER" | "STUDENT"

const VALID_COMMITTEES = new Set<CommitteeType>(["ADMIN", "DISCIPLINE", "IT", "CURRICULUM", "ECA"])
const VALID_ROLES      = new Set<Role>(["TEACHER", "STUDENT"])

function parseCommittees(raw: string): CommitteeType[] {
  if (!raw || !raw.trim()) return []
  return raw.split("|").map((s) => s.trim()).filter((s): s is CommitteeType => VALID_COMMITTEES.has(s as CommitteeType))
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get("file")
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 })
  }

  const text = await file.text()
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)

  if (lines.length < 2) {
    return NextResponse.json({ error: "CSV must have header + at least one row" }, { status: 400 })
  }

  // Skip header row
  const dataLines = lines.slice(1)

  // Cap import size to prevent a huge upload from tying up the DB.
  const MAX_ROWS = 1000
  if (dataLines.length > MAX_ROWS) {
    return NextResponse.json({ error: `一次最多匯入 ${MAX_ROWS} 行，請分批上載。` }, { status: 400 })
  }

  let created = 0
  let updated = 0
  const errors: { row: number; email: string; reason: string }[] = []

  // Pre-fetch all classes to avoid multiple lookups
  const allClasses = await prisma.class.findMany({ select: { id: true, classCode: true } })
  const classMap = new Map(allClasses.map((c) => [c.classCode, c.id]))

  for (let i = 0; i < dataLines.length; i++) {
    const row = dataLines[i]
    const parts = row.split(",")
    if (parts.length < 3) {
      errors.push({ row: i + 2, email: parts[0] ?? "", reason: "Too few columns (expected at least: email,name,role)" })
      continue
    }

    const [email, name, roleRaw, committeesRaw = "", chairOfRaw = "", classesRaw = "", classNumbersRaw = "", passwordRaw = ""] = parts
    const trimmedEmail = email.trim()
    const trimmedName  = name.trim()
    const role         = roleRaw.trim() as Role
    const password     = passwordRaw.trim()

    if (!trimmedEmail) {
      errors.push({ row: i + 2, email: trimmedEmail, reason: "Email is required" })
      continue
    }

    if (!VALID_ROLES.has(role)) {
      errors.push({ row: i + 2, email: trimmedEmail, reason: `Invalid role "${roleRaw}" — must be TEACHER or STUDENT` })
      continue
    }

    if (password && password.length < 8) {
      errors.push({ row: i + 2, email: trimmedEmail, reason: "密碼至少需 8 個字元" })
      continue
    }

    const committees   = parseCommittees(committeesRaw)
    const chairOf      = parseCommittees(chairOfRaw)
    const classCodes   = classesRaw.split("|").map((s) => s.trim()).filter(Boolean)
    const classNumbers = classNumbersRaw.split("|").map((s) => s.trim())

    try {
      const existing = await prisma.user.findUnique({ where: { email: trimmedEmail } })
      let userId = ""
      
      const hashedPassword = password ? await bcrypt.hash(password, 10) : undefined

      if (existing) {
        await prisma.user.update({
          where: { email: trimmedEmail },
          data: {
            name: trimmedName || existing.name,
            role,
            ...(hashedPassword ? { password: hashedPassword } : {})
          },
        })
        userId = existing.id
        updated++
      } else {
        const newUser = await prisma.user.create({
          data: {
            email: trimmedEmail,
            name:  trimmedName || null,
            role,
            password: hashedPassword || null,
          },
        })
        userId = newUser.id
        created++
      }

      // Replace committee memberships
      await prisma.committeeRole.deleteMany({ where: { userId } })
      if (committees.length > 0) {
        await prisma.committeeRole.createMany({
          data: committees.map((c) => ({
            userId,
            committee: c,
            isChair:   chairOf.includes(c),
          })),
        })
      }

      // Replace class enrollments
      if (role === "STUDENT") {
        await prisma.classEnrollment.deleteMany({ where: { studentId: userId } })
        const enrollmentData = classCodes
          .map((code, idx) => {
            const classId = classMap.get(code)
            if (!classId) return null
            return { 
              classId, 
              studentId: userId,
              classNumber: classNumbers[idx] || null
            }
          })
          .filter((d): d is { classId: string; studentId: string; classNumber: string | null } => !!d)

        if (enrollmentData.length > 0) {
          await prisma.classEnrollment.createMany({ data: enrollmentData })
        }
      }
    } catch (_err) {
      console.error(`Error importing row ${i + 2}:`, _err)
      errors.push({ row: i + 2, email: trimmedEmail, reason: "Database error — check for duplicate entries or constraints" })
    }
  }

  return NextResponse.json({ created, updated, errors })
}
