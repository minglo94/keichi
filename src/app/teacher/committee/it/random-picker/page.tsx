"use client"

import Link from "next/link"
import { RandomPicker } from "@/components/tools/RandomPicker"

// The picker lives in components/tools so 課堂 can draw from a live roster.
// Without `items` it behaves as it always has here: names typed one per line,
// remembered in localStorage under the same key as before.
export default function RandomPickerPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/teacher/committee/it" className="text-caption" style={{ color: "var(--color-ink-400)" }}>
          ← 資訊科技
        </Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">隨機點名器</h1>
      </div>
      <RandomPicker />
    </div>
  )
}
