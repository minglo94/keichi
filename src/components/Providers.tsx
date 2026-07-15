"use client"

import { SessionProvider as NextAuthSessionProvider, useSession } from "next-auth/react"
import { useRouter, usePathname } from "next/navigation"
import { useEffect } from "react"

/** Watches for an expired/invalidated session and redirects to /login. */
function SessionWatcher() {
  const { status } = useSession()
  const router     = useRouter()
  const pathname   = usePathname()

  useEffect(() => {
    if (status === "unauthenticated" && pathname !== "/login") {
      router.replace("/login")
    }
  }, [status, pathname, router])

  return null
}

/**
 * Root client provider.
 * - Wraps the app with NextAuth's SessionProvider.
 * - refetchInterval: re-validates the JWT every 5 minutes so an expired
 *   session is detected promptly without waiting for user navigation.
 * - refetchOnWindowFocus: re-validates immediately when the tab regains focus
 *   (catches the common case of returning after 2+ hours away).
 * - SessionWatcher handles the actual redirect to /login.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider refetchInterval={5 * 60} refetchOnWindowFocus>
      <SessionWatcher />
      {children}
    </NextAuthSessionProvider>
  )
}
