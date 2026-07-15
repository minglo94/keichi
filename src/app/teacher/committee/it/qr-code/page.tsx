"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import QRCode from "qrcode"

const PRESETS = [
  { label: "學校網站",          value: "https://www.school.edu.hk" },
  { label: "Google Classroom",  value: "https://classroom.google.com" },
  { label: "學校 Wi-Fi",        value: "WIFI:T:WPA;S:SchoolWiFi;P:password123;;" },
]

const SIZES = [128, 256, 512]

type BulkItem = { label: string; url: string; dataUrl: string }

export default function QRCodePage() {
  const [tab,      setTab]      = useState<"single" | "bulk">("single")

  // Single mode
  const [text,     setText]     = useState("")
  const [size,     setSize]     = useState(256)
  const [rendered, setRendered] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Bulk mode
  const [bulkInput,    setBulkInput]    = useState("")
  const [bulkItems,    setBulkItems]    = useState<BulkItem[]>([])
  const [bulkLoading,  setBulkLoading]  = useState(false)

  useEffect(() => {
    if (!text || !canvasRef.current) { setRendered(false); return }
    QRCode.toCanvas(canvasRef.current, text, { width: size, margin: 2, color: { dark: "#1a1a2e", light: "#ffffff" } })
      .then(() => setRendered(true))
      .catch(() => setRendered(false))
  }, [text, size])

  function download() {
    if (!canvasRef.current || !rendered) return
    const a = document.createElement("a")
    a.href     = canvasRef.current.toDataURL("image/png")
    a.download = "qrcode.png"
    a.click()
  }

  const generateBulk = useCallback(async () => {
    const lines = bulkInput.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) return
    setBulkLoading(true)
    const results: BulkItem[] = []
    for (const line of lines) {
      try {
        const dataUrl = await QRCode.toDataURL(line, { width: 256, margin: 2, color: { dark: "#1a1a2e", light: "#ffffff" } })
        results.push({ label: line, url: line, dataUrl })
      } catch { /* skip invalid */ }
    }
    setBulkItems(results)
    setBulkLoading(false)
  }, [bulkInput])

  async function downloadAllZip() {
    if (bulkItems.length === 0) return
    const { default: JSZip } = await import("jszip")
    const zip = new JSZip()
    bulkItems.forEach((item, i) => {
      const base64 = item.dataUrl.split(",")[1]
      const name   = `qr_${String(i + 1).padStart(2, "0")}_${item.label.replace(/[^a-zA-Z0-9一-鿿]/g, "_").slice(0, 30)}.png`
      zip.file(name, base64, { base64: true })
    })
    const blob = await zip.generateAsync({ type: "blob" })
    const a    = document.createElement("a")
    a.href     = URL.createObjectURL(blob)
    a.download = "qrcodes.zip"
    a.click()
  }

  const inputCls   = "w-full px-3 py-2 text-body rounded-input border outline-none"
  const inputStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }

  const tabStyle = (active: boolean) => ({
    background: active ? "var(--color-accent)" : "transparent",
    color:      active ? "white" : "var(--color-ink-500)",
    border:     "none",
  })

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <Link href="/teacher/committee/it" className="text-caption" style={{ color: "var(--color-ink-400)" }}>
          ← 資訊科技
        </Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">QR Code 生成器</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-input mb-6" style={{ background: "var(--color-surface-2)", width: "fit-content" }}>
        {(["single", "bulk"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="text-caption px-4 py-1.5 rounded-input font-medium transition-colors"
            style={tabStyle(tab === t)}
          >
            {t === "single" ? "單個生成" : "批量生成"}
          </button>
        ))}
      </div>

      {/* ── Single tab ── */}
      {tab === "single" && (
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>輸入網址或文字</label>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="https://…"
                className={inputCls}
                style={inputStyle}
                maxLength={500}
              />
              <p className="text-caption mt-1" style={{ color: "var(--color-ink-300)" }}>{text.length} / 500</p>
            </div>

            <div>
              <p className="text-caption mb-2" style={{ color: "var(--color-ink-700)" }}>快速填入</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => setText(p.value)}
                    className="text-caption px-3 py-1.5 rounded-pill border transition-colors"
                    style={{ border: "1px solid var(--color-border)", color: "var(--color-ink-700)" }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-caption mb-2" style={{ color: "var(--color-ink-700)" }}>尺寸</p>
              <div className="flex gap-2">
                {SIZES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setSize(s)}
                    className="text-caption px-3 py-1.5 rounded-input border transition-colors"
                    style={{
                      border:     "1px solid var(--color-border)",
                      background: size === s ? "var(--color-accent)" : "var(--color-surface)",
                      color:      size === s ? "white" : "var(--color-ink-700)",
                    }}
                  >
                    {s}px
                  </button>
                ))}
              </div>
            </div>

            {rendered && (
              <button
                onClick={download}
                className="w-full px-4 py-2.5 rounded-input text-body font-medium text-white"
                style={{ background: "var(--color-accent)" }}
              >
                下載 PNG
              </button>
            )}
          </div>

          <div
            className="card flex items-center justify-center min-h-[260px]"
            style={{ background: "var(--color-surface-2)" }}
          >
            {text ? (
              <canvas ref={canvasRef} style={{ borderRadius: 8 }} />
            ) : (
              <div className="text-center" style={{ color: "var(--color-ink-300)" }}>
                <p className="text-h2 mb-1">⬜</p>
                <p className="text-caption">輸入文字後即時生成</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bulk tab ── */}
      {tab === "bulk" && (
        <div className="space-y-4">
          <div>
            <label className="text-caption block mb-1" style={{ color: "var(--color-ink-700)" }}>
              每行一個網址或文字（最多 50 項）
            </label>
            <textarea
              value={bulkInput}
              onChange={(e) => setBulkInput(e.target.value)}
              placeholder={"https://example1.com\nhttps://example2.com\n學生A姓名"}
              rows={6}
              className="w-full px-3 py-2 text-body rounded-input border outline-none resize-none"
              style={inputStyle}
            />
            <p className="text-caption mt-1" style={{ color: "var(--color-ink-300)" }}>
              {bulkInput.split(/\r?\n/).filter((l) => l.trim()).length} 項
            </p>
          </div>

          <button
            onClick={generateBulk}
            disabled={bulkLoading || !bulkInput.trim()}
            className="px-5 py-2 rounded-input text-body font-medium text-white disabled:opacity-50"
            style={{ background: "var(--color-accent)" }}
          >
            {bulkLoading ? "生成中…" : "批量生成"}
          </button>

          {bulkItems.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-body font-medium" style={{ color: "var(--color-ink-900)" }}>
                  已生成 {bulkItems.length} 個 QR Code
                </p>
                <button
                  onClick={downloadAllZip}
                  className="text-caption px-3 py-1.5 rounded-input text-white"
                  style={{ background: "var(--color-accent)" }}
                >
                  下載全部 ZIP
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {bulkItems.map((item, i) => (
                  <div key={i} className="card p-3 text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.dataUrl} alt={item.label} className="w-full max-w-[128px] mx-auto" />
                    <p className="text-caption mt-2 truncate" style={{ color: "var(--color-ink-700)" }}>
                      {item.label}
                    </p>
                    <a
                      href={item.dataUrl}
                      download={`qr_${i + 1}.png`}
                      className="mt-1 inline-block text-caption"
                      style={{ color: "var(--color-accent)" }}
                    >
                      下載
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
