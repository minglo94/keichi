import { isAdmin, canEditCommittee } from "@/lib/roles"
import type { CommitteeType, Role } from "@prisma/client"

// Who may change an activity: its creator, the committee's chair, or an admin —
// the same set that may approve or delete it.
//
// Creator-only was the rule on assign/PATCH, which meant nobody could add
// students to an activity they hadn't created themselves — including the ones
// the system creates on their behalf when a notice is approved.
export async function canManageActivity(
  activity: { createdById: string; committee: CommitteeType | null },
  user: { id: string; role: Role },
): Promise<boolean> {
  if (activity.createdById === user.id) return true
  if (isAdmin(user.role)) return true
  if (!activity.committee) return false
  return canEditCommittee(user.id, user.role, activity.committee)
}
