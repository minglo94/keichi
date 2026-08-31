"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { FreeSlotsPanel, type Staff } from "@/components/teacher/FreeSlotsPanel"

// 共同空堂 — the same panel as the 教師進修 tab, but standalone and open to
// every teacher. 教師進修 is admin-only; arranging a meeting isn't.
export default function FreeSlotsPage() {
  const [staff, setStaff] = useState<Staff[]>([])

  useEffect(() => {
    fetch("/api/users?take=500")
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setStaff(Array.isArray(d) ? d : []))
  }, [])

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/teacher/committee/admin" className="text-caption" style={{ color: "var(--color-ink-400)" }}>← 行政</Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">共同空堂</h1>
      </div>
      <p className="text-caption mb-5" style={{ color: "var(--color-ink-400)" }}>
        揀科組、委員會或者逐個加教師，睇下邊幾節大家都冇課，方便約開會。
      </p>

      <FreeSlotsPanel staff={staff} />
    </div>
  )
}
