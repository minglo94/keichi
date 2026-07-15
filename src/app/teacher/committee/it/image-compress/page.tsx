"use client"

import { useRef, useState } from "react"
import Link from "next/link"

type CompressedFile = {
  name:         string
  originalMB:   string
  compressedMB: string
  url:          string
  thumbUrl:     string
  saved:        number // percentage
}

export default function ImageCompressPage() {
  const [results,    setResults]    = useState<CompressedFile[]>([])
  const [converting, setConverting] = useState(false)
  const [progress,   setProgress]   = useState("")
  const [dragging,   setDragging]   = useState(false)
  const [quality,    setQuality]    = useState(80)
  const [maxDim,     setMaxDim]     = useState(1920)
  const inputRef = useRef<HTMLInputElement>(null)

  const inputCls   = "w-full px-3 py-2 text-body rounded-input border outline-none focus:ring-2 focus:ring-offset-0"
  const inputStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }

  async function processFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setConverting(true)
    const newResults: CompressedFile[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      setProgress(`壓縮中 ${i + 1} / ${files.length}：${file.name}`)
      try {
        const { default: imageCompression } = await import("browser-image-compression")
        const compressed = await imageCompression(file, {
          maxSizeMB:        (quality / 100) * 2,
          maxWidthOrHeight: maxDim,
          useWebWorker:     true,
          initialQuality:   quality / 100,
        })
        const url          = URL.createObjectURL(compressed)
        const originalMB   = (file.size / 1024 / 1024).toFixed(2)
        const compressedMB = (compressed.size / 1024 / 1024).toFixed(2)
        const saved        = Math.round((1 - compressed.size / file.size) * 100)
        newResults.push({ name: file.name, originalMB, compressedMB, url, thumbUrl: url, saved })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setProgress(`⚠ 跳過 ${file.name}（${msg}）`)
        await new Promise((r) => setTimeout(r, 1500))
      }
    }

    setResults((prev) => [...prev, ...newResults])
    setProgress("")
    setConverting(false)
  }

  function download(item: CompressedFile) {
    const a    = document.createElement("a")
    a.href     = item.url
    a.download = item.name.replace(/(\.[^.]+)$/, "_compressed$1")
    a.click()
  }

  function downloadAll() { results.forEach(download) }

  function clearAll() {
    results.forEach((r) => URL.revokeObjectURL(r.url))
    setResults([])
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/teacher/committee/it" className="text-caption" style={{ color: "var(--color-ink-400)" }}>
          ← 資訊科技
        </Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">圖片壓縮器</h1>
      </div>
      <p className="text-body mb-6" style={{ color: "var(--color-ink-500)" }}>
        在瀏覽器本地壓縮，檔案不會上傳至任何伺服器。支援 JPG、PNG、WebP。
      </p>

      {/* Settings */}
      <div className="card p-4 mb-4 grid grid-cols-2 gap-4">
        <div>
          <label className="text-caption font-medium block mb-1" style={{ color: "var(--color-ink-700)" }}>
            壓縮品質：{quality}%
          </label>
          <input
            type="range" min={20} max={100} step={5} value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full accent-[var(--color-accent)]"
          />
        </div>
        <div>
          <label className="text-caption font-medium block mb-1" style={{ color: "var(--color-ink-700)" }}>
            最大邊長（像素）
          </label>
          <input
            type="number" value={maxDim} min={320} max={4096} step={160}
            onChange={(e) => setMaxDim(Number(e.target.value))}
            className={inputCls} style={inputStyle}
          />
        </div>
      </div>

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
        <div className="text-4xl mb-2">🖼️</div>
        <p className="text-body font-medium" style={{ color: "var(--color-ink-700)" }}>
          拖放圖片至此，或點擊選取
        </p>
        <p className="text-caption mt-1" style={{ color: "var(--color-ink-400)" }}>支援批量處理</p>
        <input
          ref={inputRef} type="file"
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          multiple className="hidden"
          onChange={(e) => processFiles(e.target.files)}
        />
      </div>

      {converting && (
        <div className="card p-3 mb-4 text-body" style={{ color: "var(--color-ink-700)" }}>
          {progress || "處理中…"}
        </div>
      )}

      {results.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>
              已壓縮 {results.length} 個檔案
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

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {results.map((item) => (
              <div key={item.url} className="card overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.thumbUrl} alt={item.name} className="w-full object-cover" style={{ height: 100 }} />
                <div className="p-2">
                  <p className="text-caption font-medium truncate" style={{ color: "var(--color-ink-900)" }}>
                    {item.name}
                  </p>
                  <p className="text-caption" style={{ color: "var(--color-ink-500)" }}>
                    {item.originalMB} MB → {item.compressedMB} MB
                  </p>
                  <p className="text-caption font-medium" style={{ color: item.saved > 0 ? "var(--color-it)" : "var(--color-ink-400)" }}>
                    節省 {item.saved}%
                  </p>
                  <button
                    onClick={() => download(item)}
                    className="mt-1.5 w-full text-caption py-1 rounded text-white text-center"
                    style={{ background: "var(--color-accent)" }}
                  >
                    下載
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
