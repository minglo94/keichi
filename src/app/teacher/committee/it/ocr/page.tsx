"use client"

import { useRef, useState } from "react"
import Link from "next/link"

export default function OcrPage() {
  const [status,   setStatus]   = useState<"idle" | "loading" | "done" | "error">("idle")
  const [text,     setText]     = useState("")
  const [errorMsg, setErrorMsg] = useState("")
  const [dragging, setDragging] = useState(false)
  const [preview,  setPreview]  = useState("")
  const [copied,   setCopied]   = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function processFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setErrorMsg("請選擇圖片檔案（JPG、PNG 等）")
      setStatus("error")
      return
    }
    setStatus("loading")
    setErrorMsg("")
    setText("")

    const previewUrl = URL.createObjectURL(file)
    setPreview(previewUrl)

    try {
      const base64 = await toBase64(file)
      const res    = await fetch("/api/tools/ocr", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ imageBase64: base64, mimeType: file.type || "image/jpeg" }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      setText(data.text ?? "")
      setStatus("done")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(msg)
      setStatus("error")
    }
  }

  function toBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload  = () => resolve((reader.result as string).split(",")[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  function handleFiles(files: FileList | null) {
    if (files && files[0]) processFile(files[0])
  }

  async function copyAll() {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function reset() {
    setStatus("idle")
    setText("")
    setPreview("")
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/teacher/committee/it" className="text-caption" style={{ color: "var(--color-ink-400)" }}>
          ← 資訊科技
        </Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">OCR 圖片文字提取</h1>
      </div>
      <p className="text-body mb-6" style={{ color: "var(--color-ink-500)" }}>
        上傳圖片，AI 自動提取其中所有文字，支援繁體中文及手寫。
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left: upload + preview */}
        <div>
          <div
            className="card p-8 text-center cursor-pointer transition-colors"
            style={{
              border:     `2px dashed ${dragging ? "var(--color-accent)" : "var(--color-border)"}`,
              background: dragging ? "var(--color-accent-soft)" : "var(--color-surface-2)",
            }}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="preview" className="max-w-full max-h-48 mx-auto rounded object-contain" />
            ) : (
              <>
                <div className="text-4xl mb-2">🔍</div>
                <p className="text-body font-medium" style={{ color: "var(--color-ink-700)" }}>
                  拖放圖片至此，或點擊選取
                </p>
                <p className="text-caption mt-1" style={{ color: "var(--color-ink-400)" }}>JPG、PNG、WebP</p>
              </>
            )}
            <input
              ref={inputRef} type="file"
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              className="hidden" onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
          {preview && (
            <button
              onClick={reset}
              className="mt-2 w-full text-caption py-1.5 rounded-input border"
              style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-500)" }}
            >
              換一張圖片
            </button>
          )}
        </div>

        {/* Right: result */}
        <div className="flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <p className="text-caption font-medium" style={{ color: "var(--color-ink-700)" }}>
              提取結果
            </p>
            {status === "done" && (
              <button
                onClick={copyAll}
                className="text-caption px-2 py-1 rounded"
                style={{ color: "var(--color-accent)", background: "var(--color-accent-soft)" }}
              >
                {copied ? "已複製 ✓" : "複製全部"}
              </button>
            )}
          </div>

          {status === "idle" && (
            <div
              className="flex-1 card p-4 flex items-center justify-center text-caption"
              style={{ color: "var(--color-ink-300)", minHeight: 200 }}
            >
              上傳圖片後顯示結果
            </div>
          )}

          {status === "loading" && (
            <div
              className="flex-1 card p-4 flex items-center justify-center text-body"
              style={{ color: "var(--color-ink-500)", minHeight: 200 }}
            >
              AI 分析中…
            </div>
          )}

          {status === "error" && (
            <div
              className="flex-1 card p-4 text-body"
              style={{ color: "var(--color-discipline)", background: "var(--color-discipline-soft)", minHeight: 200 }}
            >
              ⚠ {errorMsg}
            </div>
          )}

          {status === "done" && (
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="flex-1 w-full p-3 text-body rounded-input border outline-none resize-none"
              style={{
                border:     "1px solid var(--color-border)",
                background: "var(--color-surface)",
                color:      "var(--color-ink-900)",
                minHeight:  200,
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
