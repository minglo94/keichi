import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { StudentSidebar } from "@/components/student/StudentSidebar"
import { SessionTimeoutWatcher } from "@/components/SessionTimeoutWatcher"
import { OnboardingTour } from "@/components/OnboardingTour"

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect("/login")

  return (
    <div className="min-h-screen" style={{ background: "var(--color-bg-base)" }}>
      <SessionTimeoutWatcher expires={session.expires} />
      <OnboardingTour />
      <StudentSidebar
        user={{
          name:  session.user.name,
          email: session.user.email,
          image: session.user.image,
        }}
      />
      <main className="md:ml-[220px] pt-[56px] md:pt-0">
        {children}
      </main>
    </div>
  )
}
