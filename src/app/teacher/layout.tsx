import { auth } from "@/lib/auth"
import { stagingAuthScope } from "@/lib/staging-prisma-scope.mjs"
import { redirect } from "next/navigation"
import { TeacherSidebar } from "@/components/teacher/TeacherSidebar"
import { SessionTimeoutWatcher } from "@/components/SessionTimeoutWatcher"
import { OnboardingTour } from "@/components/OnboardingTour"
import { AskKeida } from "@/components/teacher/AskKeida"
import { visibleRestrictedCommittees } from "@/lib/committee"

export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user || (session.user.role !== "TEACHER" && session.user.role !== "ADMIN")) {
    redirect("/login")
  }

  // Restricted committees (學生支援) are hidden from the nav unless this user
  // belongs to one — the page itself is private, so advertising it would be odd.
  const restricted = await visibleRestrictedCommittees(session.user.id, session.user.role)

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "var(--color-bg)" }}>
      <SessionTimeoutWatcher expires={session.expires} />
      <OnboardingTour />
      <TeacherSidebar
        user={{
          name:  session.user.name,
          email: session.user.email,
          image: session.user.image,
          role:  session.user.role,
        }}
        visibleRestricted={restricted}
      />
      {/* Desktop: offset by sidebar width; Mobile: offset by top bar height */}
      <main className="flex-1 min-w-0 md:ml-[220px] pt-14 md:pt-0">
        {children}
      </main>
      {!stagingAuthScope()?.candidate && <AskKeida />}
    </div>
  )
}
