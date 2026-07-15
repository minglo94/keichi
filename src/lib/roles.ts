import type { Role, CommitteeType } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export function isTeacherOrAdmin(role: Role | undefined): boolean {
  return role === "TEACHER" || role === "ADMIN"
}

export function isAdmin(role: Role | undefined): boolean {
  return role === "ADMIN"
}

// A user may edit a committee's tools if they are a global ADMIN or the
// committee's chair (CommitteeRole.isChair for that committee).
export async function canEditCommittee(
  userId: string,
  role: Role | undefined,
  committee: CommitteeType
): Promise<boolean> {
  if (role === "ADMIN") return true
  const chair = await prisma.committeeRole.findFirst({
    where: { userId, committee, isChair: true },
  })
  return !!chair
}
