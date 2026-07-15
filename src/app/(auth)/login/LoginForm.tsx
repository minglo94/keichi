"use client"

import { useState } from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [error, setError]       = useState("")
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError("電郵或密碼不正確")
    } else {
      router.push("/")
      router.refresh()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-ink-700)" }}>
          電郵
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="example@school.edu.hk"
          className="w-full border rounded-lg px-3 py-2 text-sm outline-none transition-colors"
          style={{
            borderColor: "var(--color-border-strong)",
            color: "var(--color-ink-900)",
            background: "var(--color-surface)",
          }}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1" style={{ color: "var(--color-ink-700)" }}>
          密碼
        </label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="••••••••"
          className="w-full border rounded-lg px-3 py-2 text-sm outline-none transition-colors"
          style={{
            borderColor: "var(--color-border-strong)",
            color: "var(--color-ink-900)",
            background: "var(--color-surface)",
          }}
        />
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--color-discipline)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg px-4 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60"
        style={{ background: "var(--color-accent)" }}
      >
        {loading ? "登入中…" : "登入"}
      </button>
    </form>
  )
}
