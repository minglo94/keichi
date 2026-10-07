"use client"

import Link from "next/link"
import { ClassTimer } from "@/components/tools/ClassTimer"
import { ProjectionFrame } from "@/components/tools/ProjectionFrame"

// The timer itself lives in components/tools so 課堂 can use the same one. This
// page keeps its URL because it is starrable (TOOL_REGISTRY keys on href).
export default function TimerPage() {
  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/teacher/committee/it" className="text-caption" style={{ color: "var(--color-ink-400)" }}>
          ← 資訊科技
        </Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">課堂計時器</h1>
      </div>

      <ProjectionFrame title="課堂計時器">
        {(big) => <ClassTimer big={big} />}
      </ProjectionFrame>

      <div className="flex gap-4 text-caption justify-center mt-6" style={{ color: "var(--color-ink-400)" }}>
        <span style={{ color: "var(--color-it)" }}>● 正常</span>
        <span style={{ color: "#f59e0b" }}>● 最後 20%</span>
        <span style={{ color: "var(--color-discipline)" }}>● 最後 10%</span>
      </div>
    </div>
  )
}
