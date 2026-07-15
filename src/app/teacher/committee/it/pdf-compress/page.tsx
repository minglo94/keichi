"use client"

import { useRef, useState } from "react"
import Link from "next/link"

export default function PdfCompressPage() {
  const [status,       setStatus]       = useState<"idle" | "loading" | "done" | "error">("idle")
  const [originalMB,   setOriginalMB]   = useState("")
  const [compressedMB, setCompressedMB] = useState("")
  const [saved,        setSaved]        = useState(0)
  const [downloadUrl,  setDownloadUrl]  = useState("")
  const [fileName,     setFileName]     = useState("")
  const [errorMsg,     setErrorMsg]     = useState("")
  const [dragging,     setDragging]     = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function processFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setErrorMsg("請選擇 PDF 檔案")
      setStatus("error")
      return
    }
    setStatus("loading")
    setErrorMsg("")
    try {
      const { PDFDocument } = await import("pdf-lib")
      const arrayBuffer  = await file.arrayBuffer()
      const pdfDoc       = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true })
      const compressed   = await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false })
      const blob         = new Blob([compressed.buffer as ArrayBuffer], { type: "application/pdf" })
      const url          = URL.createObjectURL(blob)
      const origMB       = (file.size       / 1024 / 1024).toFixed(2)
      const compMB       = (blob.size       / 1024 / 1024).toFixed(2)
      const savedPct     = Math.max(0, Math.round((1 - blob.size / file.size) * 100))

      if (downloadUrl) URL.revokeObjectURL(downloadUrl)
      setOriginalMB(origMB)
      setCompressedMB(compMB)
      setSaved(savedPct)
      setDownloadUrl(url)
      setFileName(file.name.replace(/\.pdf$/i, "_compressed.pdf"))
      setStatus("done")
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(msg)
      setStatus("error")
    }
  }

  function handleFiles(files: FileList | null) {
    if (files && files[0]) processFile(files[0])
  }

  function download() {
    const a    = document.createElement("a")
    a.href     = downloadUrl
    a.download = fileName
    a.click()
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/teacher/committee/it" className="text-caption" style={{ color: "var(--color-ink-400)" }}>
          ← 資訊科技
        </Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">PDF 壓縮器</h1>
      </div>
      <p className="text-body mb-6" style={{ color: "var(--color-ink-500)" }}>
        在瀏覽器本地壓縮 PDF，檔案不會上傳至任何伺服器。
      </p>

      {/* Drop zone */}
      <div
        className="card p-10 text-center cursor-pointer mb-6 transition-colors"
        style={{
          border:     `2px dashed ${dragging ? "var(--color-accent)" : "var(--color-border)"}`,
          background: dragging ? "var(--color-accent-soft)" : "var(--color-surface-2)",
        }}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
      >
        <div className="text-4xl mb-2">📄</div>
        <p className="text-body font-medium" style={{ color: "var(--color-ink-700)" }}>
          拖放 PDF 至此，或點擊選取
        </p>
        <input
          ref={inputRef} type="file" accept=".pdf,application/pdf"
          className="hidden" onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {status === "loading" && (
        <div className="card p-4 text-center text-body" style={{ color: "var(--color-ink-700)" }}>
          壓縮中…
        </div>
      )}

      {status === "error" && (
        <div className="card p-4 text-body" style={{ color: "var(--color-discipline)", background: "var(--color-discipline-soft)" }}>
          ⚠ {errorMsg}
        </div>
      )}

      {status === "done" && (
        <div className="card p-5 space-y-4">
          <div className="grid grid-cols-3 text-center gap-2">
            <div>
              <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>原始大小</p>
              <p className="text-h2">{originalMB} MB</p>
            </div>
            <div className="flex items-center justify-center text-2xl">→</div>
            <div>
              <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>壓縮後</p>
              <p className="text-h2" style={{ color: saved > 0 ? "var(--color-it)" : "var(--color-ink-900)" }}>
                {compressedMB} MB
              </p>
            </div>
          </div>
          {saved > 0 ? (
            <p className="text-center text-body font-medium" style={{ color: "var(--color-it)" }}>
              節省了 {saved}%
            </p>
          ) : (
            <p className="text-center text-caption" style={{ color: "var(--color-ink-400)" }}>
              此 PDF 已是最佳化狀態，大小變化不大。
            </p>
          )}
          <button
            onClick={download}
            className="w-full py-2 rounded-input text-white font-medium text-body"
            style={{ background: "var(--color-accent)" }}
          >
            下載壓縮後的 PDF
          </button>
          <button
            onClick={() => { setStatus("idle"); URL.revokeObjectURL(downloadUrl) }}
            className="w-full py-2 rounded-input text-caption border"
            style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-500)" }}
          >
            壓縮另一個檔案
          </button>
        </div>
      )}
    </div>
  )
}
