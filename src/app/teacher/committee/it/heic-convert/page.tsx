"use client"

import { useRef, useState } from "react"
import Link from "next/link"

type ConvertedFile = {
  name:     string
  url:      string
  sizeMB:   string
}

export default function HeicConvertPage() {
  const [results,    setResults]    = useState<ConvertedFile[]>([])
  const [converting, setConverting] = useState(false)
  const [progress,   setProgress]   = useState<string>("")
  const [dragging,   setDragging]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function processFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setConverting(true)
    const newResults: ConvertedFile[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setProgress(`轉換中 ${i + 1} / ${files.length}：${file.name}`)
      try {
        const fd = new FormData()
        fd.append("file", file)

        const res = await fetch("/api/tools/heic-convert", { method: "POST", body: fd })

        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error ?? `HTTP ${res.status}`)
        }

        const blob   = await res.blob()
        const url    = URL.createObjectURL(blob)
        const sizeMB = (blob.size / 1024 / 1024).toFixed(2)
        newResults.push({ name: file.name.replace(/\.[^.]+$/, ""), url, sizeMB })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("HEIC Conversion Error:", err)
        setProgress(`⚠ 跳過 ${file.name}（${msg}）`)
        await new Promise((r) => setTimeout(r, 1500))
      }
    }

    setResults((prev) => [...prev, ...newResults])
    setProgress("")
    setConverting(false)
  }

  function download(item: ConvertedFile) {
    const a    = document.createElement("a")
    a.href     = item.url
    a.download = item.name + ".jpg"
    a.click()
  }

  function downloadAll() { results.forEach(download) }

  function clearAll() {
    results.forEach((item) => URL.revokeObjectURL(item.url))
    setResults([])
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/teacher/committee/it" className="text-caption" style={{ color: "var(--color-ink-400)" }}>
          ← 資訊科技
        </Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">HEIC → JPG 轉換器</h1>
      </div>
      <p className="text-body mb-6" style={{ color: "var(--color-ink-500)" }}>
        上傳 HEIC 檔案，伺服器自動轉換為 JPG 後即時下載。
      </p>

      {/* Drop zone */}
      <div
        className="card p-8 text-center cursor-pointer mb-6 transition-colors"
        style={{
          border:     `2px dashed ${dragging ? "var(--color-accent)" : "var(--color-border)"}`,
          background: dragging ? "var(--color-accent-soft)" : "var(--color-surface-2)",
        }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); processFiles(e.dataTransfer.files) }}
      >
        <div className="text-4xl mb-2">📷</div>
        <p className="text-body font-medium" style={{ color: "var(--color-ink-700)" }}>
          拖放 HEIC 檔案至此，或點擊選取
        </p>
        <p className="text-caption mt-1" style={{ color: "var(--color-ink-400)" }}>支援批量處理 · 接受 .heic / .heif</p>
        <input
          ref={inputRef}
          type="file"
          accept=".heic,.HEIC,.heif,.HEIF,image/heic,image/heif"
          multiple
          className="hidden"
          onChange={(e) => processFiles(e.target.files)}
        />
      </div>

      {/* Progress */}
      {converting && (
        <div className="card p-3 mb-4 text-body" style={{ color: "var(--color-ink-700)" }}>
          {progress || "處理中…"}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>
              已轉換 {results.length} 個檔案
            </p>
            <div className="flex gap-2">
              <button
                onClick={downloadAll}
                className="text-caption px-3 py-1.5 rounded-input text-white"
                style={{ background: "var(--color-accent)" }}
              >
                下載全部
              </button>
              <button
                onClick={clearAll}
                className="text-caption px-3 py-1.5 rounded-input border"
                style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-500)" }}
              >
                清除
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {results.map((item) => (
              <div
                key={item.url}
                className="card px-4 py-3 flex items-center gap-3"
              >
                <div className="text-2xl">🖼️</div>
                <div className="flex-1 min-w-0">
                  <p className="text-body font-medium truncate" style={{ color: "var(--color-ink-900)" }}>
                    {item.name}.jpg
                  </p>
                  <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>
                    {item.sizeMB} MB
                  </p>
                </div>
                <button
                  onClick={() => download(item)}
                  className="shrink-0 text-caption px-3 py-1.5 rounded-input text-white"
                  style={{ background: "var(--color-accent)" }}
                >
                  下載
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
