"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"

export function SessionTimeoutWatcher({ expires }: { expires: string | undefined }) {
  const router = useRouter()
  const [warning, setWarning] = useState(false)

  useEffect(() => {
    if (!expires) return

    const check = () => {
      const expiryTime = new Date(expires).getTime()
      const now = new Date().getTime()
      const timeLeft = expiryTime - now

      // Show warning 5 minutes before expiration
      if (timeLeft <= 5 * 60 * 1000 && timeLeft > 0) {
        setWarning(true)
      } else {
        setWarning(false)
      }

      if (timeLeft <= 0) {
        router.push("/login")
        return
      }
    }

    const timer = setInterval(check, 10000) // Check every 10 seconds
    check()

    return () => clearInterval(timer)
  }, [expires, router])

  if (!warning) return null

  return (
    <div className="fixed bottom-6 right-6 z-[100] animate-bounce-slow">
      <div className="bg-red-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-red-500">
        <span className="text-xl">⚠️</span>
        <div>
          <p className="text-sm font-bold">登入即將過期</p>
          <p className="text-xs opacity-90">請儲存工作或重新整理頁面</p>
        </div>
      </div>
    </div>
  )
}
