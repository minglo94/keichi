"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import {
  ShoppingCart,
  Camera,
  Loader2,
  CheckCircle2,
  Download,
  Plus,
  Trash2,
  Upload,
  Eye,
  EyeOff,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────────────────
type Item = { name: string; qty: string }
type Supplier = { name: string; tel: string; total: string }

type OcrStatus = "idle" | "loading" | "success" | "error"

const DEPT_OPTIONS = ["電腦科", "IT及電子學習組", "圖書館", "STEAM教育組", "行政"]
const RANK_OPTIONS = ["助理教席", "教席", "高級教席", "科主任", "副校長", "校長", "行政主任"]
const QUOTE_METHODS: { value: "phone" | "fax" | "mail" | "other"; label: string }[] = [
  { value: "phone", label: "電話" },
  { value: "fax", label: "傳真" },
  { value: "mail", label: "專人傳遞" },
  { value: "other", label: "其他" },
]
const CATEGORIES: { value: "fixed" | "consumable" | "other"; label: string }[] = [
  { value: "fixed", label: "固定資產" },
  { value: "consumable", label: "消耗品" },
  { value: "other", label: "其他" },
]

const today = () => new Date().toISOString().slice(0, 10)

export default function QuotationPage() {
  // ── Header ──
  const [quotationDate, setQuotationDate] = useState(today())
  const [quoteMethod, setQuoteMethod] = useState<"phone" | "fax" | "mail" | "other">("phone")
  const [quoteMethodOther, setQuoteMethodOther] = useState("")
  const [higherPriceReason, setHigherPriceReason] = useState("")
  const [fewerSuppliersReason, setFewerSuppliersReason] = useState("")

  // ── Items ──
  const [quotationName, setQuotationName] = useState("")
  const [items, setItems] = useState<Item[]>([{ name: "", qty: "" }])

  // ── Suppliers ──
  const [supA, setSupA] = useState<Supplier>({ name: "", tel: "", total: "" })
  const [supB, setSupB] = useState<Supplier>({ name: "", tel: "", total: "" })
  const [supAPrices, setSupAPrices] = useState<string[]>([""])
  const [supBPrices, setSupBPrices] = useState<string[]>([""])
  const [recommended, setRecommended] = useState<"A" | "B">("A")
  const [priceType, setPriceType] = useState<"lower" | "higher">("lower")

  // ── Details ──
  const [itemCategory, setItemCategory] = useState<"fixed" | "consumable" | "other">("consumable")
  const [categoryOther, setCategoryOther] = useState("")
  const [department, setDepartment] = useState("")
  const [purpose, setPurpose] = useState("")
  const [deliveryDate, setDeliveryDate] = useState("")
  const [fundingSource, setFundingSource] = useState("")

  // ── Signatures ──
  const [requestorName, setRequestorName] = useState("")
  const [requestorRank, setRequestorRank] = useState("")
  const [requestorDate, setRequestorDate] = useState(today())
  const [deptHeadName, setDeptHeadName] = useState("")
  const [deptHeadRank, setDeptHeadRank] = useState("")
  const [deptHeadDate, setDeptHeadDate] = useState(today())
  const [approverName, setApproverName] = useState("")
  const [approverRank, setApproverRank] = useState("")
  const [approverDate, setApproverDate] = useState(today())

  // ── Preview ──
  const [showPreview, setShowPreview] = useState(false)

  // ── OCR + generate ──
  const [ocrTarget, setOcrTarget] = useState<"A" | "B">("A")
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>("idle")
  const [ocrMessage, setOcrMessage] = useState("")
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState("")

  // ── Items helpers ────────────────────────────────────────────────────────
  function addItem() {
    if (items.length >= 3) return
    setItems((prev) => [...prev, { name: "", qty: "" }])
    setSupAPrices((prev) => [...prev, ""])
    setSupBPrices((prev) => [...prev, ""])
  }
  function delItem(i: number) {
    if (items.length === 1) {
      setItems([{ name: "", qty: "" }])
      setSupAPrices([""])
      setSupBPrices([""])
      return
    }
    setItems((prev) => prev.filter((_, idx) => idx !== i))
    setSupAPrices((prev) => prev.filter((_, idx) => idx !== i))
    setSupBPrices((prev) => prev.filter((_, idx) => idx !== i))
  }
  function updateItem(i: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  }
  function calcTotal(which: "A" | "B") {
    const prices = which === "A" ? supAPrices : supBPrices
    const total = items.reduce((sum, it, i) => {
      const price = parseFloat(prices[i] || "0") || 0
      const qty = parseFloat(it.qty || "1") || 1
      return sum + price * qty
    }, 0)
    const setter = which === "A" ? setSupA : setSupB
    setter((prev) => ({ ...prev, total: total.toFixed(2) }))
  }

  // ── OCR ──────────────────────────────────────────────────────────────────
  async function runOCR(file: File) {
    setOcrStatus("loading")
    setOcrMessage("識別中，請稍候…")
    const fd = new FormData()
    fd.append("file", file)
    try {
      const res = await fetch("/api/quotation/ocr", { method: "POST", body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setOcrStatus("error")
        setOcrMessage(data?.error || "識別失敗")
        return
      }
      const setter = ocrTarget === "A" ? setSupA : setSupB
      const setPrices = ocrTarget === "A" ? setSupAPrices : setSupBPrices

      if (data.supplier_name)
        setter((prev) => ({ ...prev, name: prev.name || data.supplier_name }))
      if (data.supplier_tel)
        setter((prev) => ({ ...prev, tel: prev.tel || data.supplier_tel }))

      const ocrItems: { name?: string; qty?: number; unit_price?: number }[] = Array.isArray(data.items)
        ? data.items.slice(0, 3)
        : []

      if (ocrItems.length > 0) {
        const filledNames = items.filter((it) => it.name.trim())
        if (filledNames.length === 0) {
          // No items yet — populate from OCR
          const newItems: Item[] = ocrItems.map((it) => ({
            name: it.name || "",
            qty: it.qty != null ? String(it.qty) : "",
          }))
          const newPrices = ocrItems.map((it) =>
            it.unit_price != null ? String(it.unit_price) : ""
          )
          setItems(newItems)
          if (ocrTarget === "A") setSupAPrices(newPrices)
          else setSupBPrices(newPrices)
        } else {
          // Items already entered — only fill blank slots
          setItems((prev) =>
            prev.map((it, i) => {
              const o = ocrItems[i]
              if (!o) return it
              return {
                name: it.name.trim() || o.name || "",
                qty: it.qty || (o.qty != null ? String(o.qty) : ""),
              }
            })
          )
          setPrices((prev) =>
            prev.map((p, i) => {
              const o = ocrItems[i]
              return p.trim() || (o?.unit_price != null ? String(o.unit_price) : "")
            })
          )
        }
      }

      if (data.total != null)
        setter((prev) => ({ ...prev, total: prev.total || String(data.total) }))

      setOcrStatus("success")
      setOcrMessage("識別完成！請核對欄位資料。")
      setPendingFile(null)
    } catch (e) {
      setOcrStatus("error")
      setOcrMessage(e instanceof Error ? e.message : "網絡錯誤")
    }
  }

  // ── Generate DOCX ────────────────────────────────────────────────────────
  async function generate() {
    setGenError("")
    const realItems = items.filter((it) => it.name.trim())
    if (!quotationDate || !quotationName.trim() || !department.trim() || !purpose.trim() || !deliveryDate || !fundingSource.trim()) {
      setGenError("請填妥必填欄位（報價日期、報價名稱、所屬科組、用途、交貨日期、撥款來源）。")
      return
    }

    setGenerating(true)
    const payload = {
      quotationDate,
      quoteMethod,
      quoteMethodOther,
      quotationName,
      items: realItems.map((it) => ({ name: it.name, qty: it.qty })),
      supplierA: {
        name: supA.name,
        tel: supA.tel,
        prices: realItems.map((_, i) => {
          const v = supAPrices[i]
          return v && v.trim() ? Number(v) : null
        }),
        total: Number(supA.total) || 0,
      },
      supplierB: {
        name: supB.name,
        tel: supB.tel,
        prices: realItems.map((_, i) => {
          const v = supBPrices[i]
          return v && v.trim() ? Number(v) : null
        }),
        total: Number(supB.total) || 0,
      },
      recommended,
      useLowerPrice: priceType === "lower",
      higherPriceReason,
      fewerSuppliersReason,
      itemCategory,
      categoryOther: itemCategory === "other" ? categoryOther : "",
      department,
      purpose,
      deliveryDate,
      fundingSource,
      requestorName,
      requestorRank,
      requestorDate,
      deptHeadName,
      deptHeadRank,
      deptHeadDate,
      approverName,
      approverRank,
      approverDate,
    }

    try {
      const res = await fetch("/api/quotation/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setGenError(data?.error || "文件生成失敗")
        setGenerating(false)
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `報價表_${department || "科組"}.docx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "生成失敗")
    } finally {
      setGenerating(false)
    }
  }

  function resetForm() {
    if (!confirm("確定要清空所有欄位？")) return
    setQuotationDate(today()); setQuoteMethod("phone"); setQuoteMethodOther(""); setHigherPriceReason(""); setFewerSuppliersReason("")
    setQuotationName(""); setItems([{ name: "", qty: "" }])
    setSupA({ name: "", tel: "", total: "" }); setSupB({ name: "", tel: "", total: "" })
    setSupAPrices([""]); setSupBPrices([""]); setRecommended("A"); setPriceType("lower")
    setItemCategory("consumable"); setCategoryOther(""); setDepartment(""); setPurpose("")
    setDeliveryDate(""); setFundingSource("")
    setRequestorName(""); setRequestorRank(""); setRequestorDate(today())
    setDeptHeadName(""); setDeptHeadRank(""); setDeptHeadDate(today())
    setApproverName(""); setApproverRank(""); setApproverDate(today())
    setOcrStatus("idle"); setOcrMessage(""); setGenError("")
  }

  // ── Styles ───────────────────────────────────────────────────────────────
  const inputCls = "w-full px-3 py-2 text-body rounded-input border outline-none"
  const inputStyle = { border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-ink-900)" }
  const labelCls = "text-caption font-medium block mb-1"
  const labelStyle = { color: "var(--color-ink-700)" }
  const legendCls = "text-body font-semibold mb-3"

  // ── Derived preview values ───────────────────────────────────────────────
  const categoryLabel =
    itemCategory === "fixed" ? "固定資產" : itemCategory === "consumable" ? "消耗品" : categoryOther || "其他"
  const quoteMethodLabel = QUOTE_METHODS.find((m) => m.value === quoteMethod)?.label ?? ""
  const realItems = items.filter((it) => it.name.trim())
  const recSup = recommended === "A" ? supA : supB
  const recPrices = recommended === "A" ? supAPrices : supBPrices

  const PREVIEW_W = 496 // px — preview panel width incl gap

  return (
    <div className="p-6 pb-28">
    {/* ── Form col: always centred by mx-auto, shifts left via translateX ── */}
    <div
      className="max-w-3xl mx-auto transition-transform duration-300 ease-in-out relative"
      style={{ transform: showPreview ? `translateX(-${PREVIEW_W / 2}px)` : "translateX(0)" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <Link href="/teacher/committee/admin" className="text-caption" style={{ color: "var(--color-ink-400)" }}>← 行政</Link>
        <span style={{ color: "var(--color-ink-300)" }}>/</span>
        <h1 className="text-h1">KCquotation 報價</h1>
        <button
          type="button"
          onClick={() => setShowPreview((v) => !v)}
          className="hidden xl:inline-flex ml-auto items-center gap-1.5 text-caption px-3 py-1.5 rounded-input border transition-colors"
          style={{
            borderColor: showPreview ? "var(--color-admin)" : "var(--color-border)",
            color: showPreview ? "var(--color-admin)" : "var(--color-ink-500)",
            background: showPreview ? "var(--color-admin-soft, #fdf2ee)" : "var(--color-surface)",
          }}
          title={showPreview ? "隱藏預覽" : "顯示文件預覽"}
        >
          {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showPreview ? "隱藏預覽" : "文件預覽"}
        </button>
      </div>
      <p className="text-caption mb-6" style={{ color: "var(--color-ink-400)" }}>
        填寫「按口頭報價採購表格」，生成可下載的 DOCX；可上傳供應商報價單由 AI 自動識別預填。
      </p>

      {/* OCR section */}
      <div
        className="card p-5 mb-5"
        style={{ borderTop: "3px solid var(--color-admin)" }}
      >
        <h2 className={legendCls} style={{ color: "var(--color-ink-900)" }}>
          <span className="inline-flex items-center gap-2">
            <Camera className="w-4 h-4" style={{ color: "var(--color-admin)" }} />
            AI 自動識別供應商報價單
          </span>
        </h2>
        <p className="text-caption mb-3" style={{ color: "var(--color-ink-500)" }}>
          上傳供應商報價單圖片（JPG / PNG / WebP）或 PDF，AI 自動識別並預填表格欄位。請核對後再生成文件。
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-caption flex items-center gap-2" style={labelStyle}>
            預填至
            <select
              value={ocrTarget}
              onChange={(e) => setOcrTarget(e.target.value as "A" | "B")}
              className="px-2 py-1 text-caption rounded-input border"
              style={inputStyle}
            >
              <option value="A">供應商 A</option>
              <option value="B">供應商 B</option>
            </select>
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,.pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) {
                setPendingFile(f)
                setOcrStatus("idle")
                setOcrMessage("")
              }
              e.target.value = ""
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-caption px-3 py-1.5 rounded-input border flex items-center gap-1.5"
            style={{ ...inputStyle, borderColor: "var(--color-admin)", color: "var(--color-admin)" }}
          >
            <Upload className="w-3.5 h-3.5" /> 選擇文件
          </button>
          {pendingFile && (
            <span className="text-caption truncate max-w-[180px]" style={{ color: "var(--color-ink-600)" }}>
              {pendingFile.name}
            </span>
          )}
          <button
            type="button"
            disabled={!pendingFile || ocrStatus === "loading"}
            onClick={() => { if (pendingFile) runOCR(pendingFile) }}
            className="text-caption px-3 py-1.5 rounded-input border flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ ...inputStyle, borderColor: "var(--color-admin)", color: "var(--color-admin)" }}
          >
            <Camera className="w-3.5 h-3.5" /> 識別
          </button>
          {ocrStatus === "loading" && (
            <span className="text-caption flex items-center gap-1.5" style={{ color: "var(--color-ink-500)" }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {ocrMessage}
            </span>
          )}
          {ocrStatus === "success" && (
            <span className="text-caption flex items-center gap-1.5" style={{ color: "var(--color-curriculum)" }}>
              <CheckCircle2 className="w-3.5 h-3.5" /> {ocrMessage}
            </span>
          )}
          {ocrStatus === "error" && (
            <span className="text-caption" style={{ color: "var(--color-discipline)" }}>{ocrMessage}</span>
          )}
        </div>
      </div>

      {/* Header: date + method */}
      <fieldset className="card p-5 mb-5 space-y-4">
        <legend className={legendCls} style={{ color: "var(--color-admin)" }}>表頭資料</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls} style={labelStyle}>報價日期 *</label>
            <input type="date" value={quotationDate} onChange={(e) => setQuotationDate(e.target.value)} className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>報價方式 *</label>
            <div className="flex flex-wrap gap-4 pt-1.5">
              {QUOTE_METHODS.map((m) => (
                <label key={m.value} className="text-caption flex items-center gap-1.5 cursor-pointer" style={{ color: "var(--color-ink-700)" }}>
                  <input
                    type="radio"
                    name="quoteMethod"
                    checked={quoteMethod === m.value}
                    onChange={() => setQuoteMethod(m.value)}
                    className="accent-[var(--color-admin)]"
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
        </div>
        {quoteMethod === "other" && (
          <div>
            <label className={labelCls} style={labelStyle}>其他報價方式說明</label>
            <input type="text" value={quoteMethodOther} onChange={(e) => setQuoteMethodOther(e.target.value)} placeholder="請說明其他報價方式" className={inputCls} style={inputStyle} />
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls} style={labelStyle}>採納較高報價原因（如適用）</label>
            <input type="text" value={higherPriceReason} onChange={(e) => setHigherPriceReason(e.target.value)} placeholder="（選填）不採納最低報價的原因" className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>邀請少於兩名供應商原因（如適用）</label>
            <input type="text" value={fewerSuppliersReason} onChange={(e) => setFewerSuppliersReason(e.target.value)} placeholder="（選填）" className={inputCls} style={inputStyle} />
          </div>
        </div>
      </fieldset>

      {/* Items */}
      <fieldset className="card p-5 mb-5 space-y-4">
        <legend className={legendCls} style={{ color: "var(--color-admin)" }}>採購項目</legend>
        <div>
          <label className={labelCls} style={labelStyle}>報價名稱（整批採購總稱）*</label>
          <input type="text" value={quotationName} onChange={(e) => setQuotationName(e.target.value)} placeholder="例：無線鍵盤及光學鼠（套裝）" className={inputCls} style={inputStyle} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-caption" style={{ color: "var(--color-ink-500)" }}>
                <th className="py-2 pr-2 w-8">#</th>
                <th className="py-2 pr-2">物品名稱 / 規格</th>
                <th className="py-2 pr-2 w-24">數量</th>
                <th className="py-2 w-10" />
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td className="py-1 pr-2 text-caption text-center" style={{ color: "var(--color-ink-500)" }}>{i + 1}</td>
                  <td className="py-1 pr-2">
                    <input
                      type="text"
                      value={it.name}
                      onChange={(e) => updateItem(i, { name: e.target.value })}
                      placeholder="物品名稱 / 規格"
                      className={inputCls}
                      style={inputStyle}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      type="number"
                      min={1}
                      value={it.qty}
                      onChange={(e) => updateItem(i, { qty: e.target.value })}
                      placeholder="數量"
                      className={inputCls}
                      style={inputStyle}
                    />
                  </td>
                  <td className="py-1">
                    <button
                      type="button"
                      onClick={() => delItem(i)}
                      className="p-1"
                      style={{ color: "var(--color-discipline)" }}
                      aria-label="刪除項目"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          onClick={addItem}
          disabled={items.length >= 3}
          className="text-caption px-3 py-1.5 rounded-input border flex items-center gap-1.5 disabled:opacity-40"
          style={{ ...inputStyle, borderColor: "var(--color-admin)", color: "var(--color-admin)" }}
        >
          <Plus className="w-3.5 h-3.5" /> 新增項目
        </button>
        <p className="text-caption" style={{ color: "var(--color-ink-400)" }}>最多支援 3 個項目（配合模板格式）。</p>
      </fieldset>

      {/* Suppliers */}
      <fieldset className="card p-5 mb-5 space-y-4">
        <legend className={legendCls} style={{ color: "var(--color-admin)" }}>供應商報價資料</legend>

        {/* Adoption bar */}
        <div
          className="flex flex-wrap items-center gap-x-6 gap-y-2 p-3 rounded-input"
          style={{ background: "#fff8e1", border: "1px solid #f9c74f" }}
        >
          <span className="text-caption font-medium" style={{ color: "var(--color-ink-800)" }}>推薦採納：</span>
          <label className="text-caption flex items-center gap-1.5 cursor-pointer" style={{ color: "var(--color-ink-800)" }}>
            <input type="radio" name="recommended" checked={recommended === "A"} onChange={() => setRecommended("A")} className="accent-[var(--color-curriculum)]" />
            採納供應商 A
          </label>
          <label className="text-caption flex items-center gap-1.5 cursor-pointer" style={{ color: "var(--color-ink-800)" }}>
            <input type="radio" name="recommended" checked={recommended === "B"} onChange={() => setRecommended("B")} className="accent-[var(--color-curriculum)]" />
            採納供應商 B
          </label>
          <label className="text-caption flex items-center gap-2 ml-auto" style={{ color: "var(--color-ink-800)" }}>
            採納類型：
            <select
              value={priceType}
              onChange={(e) => setPriceType(e.target.value as "lower" | "higher")}
              className="px-2 py-1 text-caption rounded-input border"
              style={inputStyle}
            >
              <option value="lower">採納較低報價</option>
              <option value="higher">採納較高報價</option>
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SupplierCard
            title="供應商 A"
            recommended={recommended === "A"}
            supplier={supA}
            onChange={(patch) => setSupA((prev) => ({ ...prev, ...patch }))}
            prices={supAPrices}
            onPriceChange={(i, v) => setSupAPrices((prev) => prev.map((p, idx) => (idx === i ? v : p)))}
            items={items}
            onCalcTotal={() => calcTotal("A")}
            inputCls={inputCls}
            inputStyle={inputStyle}
            labelCls={labelCls}
            labelStyle={labelStyle}
          />
          <SupplierCard
            title="供應商 B"
            recommended={recommended === "B"}
            supplier={supB}
            onChange={(patch) => setSupB((prev) => ({ ...prev, ...patch }))}
            prices={supBPrices}
            onPriceChange={(i, v) => setSupBPrices((prev) => prev.map((p, idx) => (idx === i ? v : p)))}
            items={items}
            onCalcTotal={() => calcTotal("B")}
            inputCls={inputCls}
            inputStyle={inputStyle}
            labelCls={labelCls}
            labelStyle={labelStyle}
          />
        </div>
      </fieldset>

      {/* Procurement details */}
      <fieldset className="card p-5 mb-5 space-y-4">
        <legend className={legendCls} style={{ color: "var(--color-admin)" }}>採購詳情</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls} style={labelStyle}>物品類別 *</label>
            <div className="flex flex-wrap gap-4 pt-1.5 mb-2">
              {CATEGORIES.map((c) => (
                <label key={c.value} className="text-caption flex items-center gap-1.5 cursor-pointer" style={{ color: "var(--color-ink-700)" }}>
                  <input
                    type="radio"
                    name="itemCategory"
                    checked={itemCategory === c.value}
                    onChange={() => setItemCategory(c.value)}
                    className="accent-[var(--color-admin)]"
                  />
                  {c.label}
                </label>
              ))}
            </div>
            {itemCategory === "other" && (
              <input type="text" value={categoryOther} onChange={(e) => setCategoryOther(e.target.value)} placeholder="其他類別說明" className={inputCls} style={inputStyle} />
            )}
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>所屬科組 *</label>
            <input type="text" list="dept-list" value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="例：電腦科" className={inputCls} style={inputStyle} />
            <datalist id="dept-list">
              {DEPT_OPTIONS.map((d) => <option key={d} value={d} />)}
            </datalist>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-1">
            <label className={labelCls} style={labelStyle}>用途 / 使用場地 *</label>
            <input type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="例：電腦室日常教學使用" className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>交貨日期 *</label>
            <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} className={inputCls} style={inputStyle} />
          </div>
          <div>
            <label className={labelCls} style={labelStyle}>撥款來源 *</label>
            <input type="text" value={fundingSource} onChange={(e) => setFundingSource(e.target.value)} placeholder="例：IT Development Fund" className={inputCls} style={inputStyle} />
          </div>
        </div>
      </fieldset>

      {/* Signatures */}
      <fieldset className="card p-5 mb-5 space-y-4">
        <legend className={legendCls} style={{ color: "var(--color-admin)" }}>簽署欄（姓名、職級）</legend>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SignBlock
            title="索取報價人"
            name={requestorName} rank={requestorRank} date={requestorDate}
            onName={setRequestorName} onRank={setRequestorRank} onDate={setRequestorDate}
            inputCls={inputCls} inputStyle={inputStyle} labelCls={labelCls} labelStyle={labelStyle}
          />
          <SignBlock
            title="科組負責人"
            name={deptHeadName} rank={deptHeadRank} date={deptHeadDate}
            onName={setDeptHeadName} onRank={setDeptHeadRank} onDate={setDeptHeadDate}
            inputCls={inputCls} inputStyle={inputStyle} labelCls={labelCls} labelStyle={labelStyle}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <SignBlock
            title="批核人（校長/副校長）"
            name={approverName} rank={approverRank} date={approverDate}
            onName={setApproverName} onRank={setApproverRank} onDate={setApproverDate}
            inputCls={inputCls} inputStyle={inputStyle} labelCls={labelCls} labelStyle={labelStyle}
          />
        </div>
        <datalist id="rank-list">
          {RANK_OPTIONS.map((r) => <option key={r} value={r} />)}
        </datalist>
      </fieldset>

      {/* Sticky generate bar */}
      <div
        className="bottom-0 left-0 right-0 md:left-[220px] p-4 flex flex-wrap items-center gap-3 z-30"
        style={{ background: "var(--color-surface)", borderTop: "1px solid var(--color-border)", boxShadow: "0 -2px 8px rgba(0,0,0,0.06)" }}
      >
        <button
          type="button"
          onClick={generate}
          disabled={generating}
          className="text-body font-semibold px-5 py-2.5 rounded-input text-white flex items-center gap-2 disabled:opacity-60"
          style={{ background: "var(--color-admin)" }}
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          {generating ? "生成中…" : "生成報價表 DOCX"}
        </button>
        <button type="button" onClick={resetForm} className="text-caption px-3 py-2 rounded-input border" style={inputStyle}>
          重設表格
        </button>
        {genError && <span className="text-caption" style={{ color: "var(--color-discipline)" }}>{genError}</span>}
        <span className="text-caption ml-auto hidden sm:inline" style={{ color: "var(--color-ink-400)" }}>
          文件將下載至本機，原始模板不受影響。
        </span>
      </div>
    </div>{/* end form col */}

    {/* ── Right: Word preview — slides in from right via translateX ── */}
    <div
      className="hidden xl:block fixed top-24 right-6 w-[480px] transition-transform duration-300 ease-in-out"
      style={{
        transform: showPreview ? "translateX(0)" : "translateX(calc(100% + 48px))",
        opacity: showPreview ? 1 : 0,
        transition: "transform 300ms ease-in-out, opacity 300ms ease-in-out",
        pointerEvents: showPreview ? "auto" : "none",
        maxHeight: "calc(100vh - 120px)",
        zIndex: 20,
      }}
    >
      <p className="text-caption mb-2 flex items-center gap-1.5" style={{ color: "var(--color-ink-400)" }}>
        <span className="inline-block w-2 h-2 rounded-full bg-green-400" />
        即時預覽 — 反映目前填寫內容
      </p>
      {/* A4 paper */}
      <div
        className="bg-white overflow-auto"
        style={{
          fontFamily: "'Times New Roman', Times, serif",
          fontSize: "9.5px",
          lineHeight: 1.4,
          color: "#000",
          padding: "32px 36px",
          boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
          maxHeight: "calc(100vh - 120px)",
          border: "1px solid #ccc",
        }}
      >
        {/* Title */}
        <p style={{ textAlign: "center", fontWeight: "bold", fontSize: "13px", marginBottom: 2 }}>
          按口頭報價採購表格
        </p>
        <p style={{ textAlign: "center", fontSize: "8.5px", marginBottom: 12, color: "#333" }}>
          Procurement Form (Verbal Quotation)
        </p>

        {/* Header info table */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
          <tbody>
            <tr>
              <DocCell w="30%" label>報價日期</DocCell>
              <DocCell w="20%">{quotationDate || " "}</DocCell>
              <DocCell w="30%" label>報價方式</DocCell>
              <DocCell w="20%">{quoteMethodLabel}</DocCell>
            </tr>
            <tr>
              <DocCell label>採購名稱</DocCell>
              <DocCell colSpan={3}>{quotationName || " "}</DocCell>
            </tr>
            <tr>
              <DocCell label>所屬科組</DocCell>
              <DocCell>{department || " "}</DocCell>
              <DocCell label>物品類別</DocCell>
              <DocCell>{categoryLabel}</DocCell>
            </tr>
            <tr>
              <DocCell label>用途／使用場地</DocCell>
              <DocCell colSpan={3}>{purpose || " "}</DocCell>
            </tr>
            <tr>
              <DocCell label>交貨日期</DocCell>
              <DocCell>{deliveryDate || " "}</DocCell>
              <DocCell label>撥款來源</DocCell>
              <DocCell>{fundingSource || " "}</DocCell>
            </tr>
          </tbody>
        </table>

        {/* Items + prices table */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
          <thead>
            <tr>
              <DocCell th w="4%">#</DocCell>
              <DocCell th w="36%">物品名稱／規格</DocCell>
              <DocCell th w="8%">數量</DocCell>
              <DocCell th w="13%" style={{ textAlign: "center" }}>供應商 A<br /><span style={{ fontWeight: "normal" }}>{supA.name || "（未填）"}</span></DocCell>
              <DocCell th w="13%" style={{ textAlign: "center" }}>供應商 B<br /><span style={{ fontWeight: "normal" }}>{supB.name || "（未填）"}</span></DocCell>
              <DocCell th w="13%" style={{ textAlign: "center" }}>推薦採納<br /><span style={{ fontWeight: "normal" }}>{`供應商 ${recommended}`}</span></DocCell>
            </tr>
          </thead>
          <tbody>
            {(realItems.length > 0 ? realItems : [{ name: "（未填）", qty: "" }]).map((it, i) => {
              const pA = supAPrices[i] ? `$${supAPrices[i]}` : "—"
              const pB = supBPrices[i] ? `$${supBPrices[i]}` : "—"
              const pRec = recommended === "A" ? pA : pB
              return (
                <tr key={i}>
                  <DocCell style={{ textAlign: "center" }}>{i + 1}</DocCell>
                  <DocCell>{it.name || " "}</DocCell>
                  <DocCell style={{ textAlign: "center" }}>{it.qty || " "}</DocCell>
                  <DocCell style={{ textAlign: "right" }}>{pA}</DocCell>
                  <DocCell style={{ textAlign: "right" }}>{pB}</DocCell>
                  <DocCell style={{ textAlign: "right", fontWeight: "bold" }}>{pRec}</DocCell>
                </tr>
              )
            })}
            {/* Totals row */}
            <tr>
              <DocCell colSpan={3} style={{ textAlign: "right", fontWeight: "bold" }}>合計</DocCell>
              <DocCell style={{ textAlign: "right", fontWeight: "bold" }}>{supA.total ? `$${supA.total}` : "—"}</DocCell>
              <DocCell style={{ textAlign: "right", fontWeight: "bold" }}>{supB.total ? `$${supB.total}` : "—"}</DocCell>
              <DocCell style={{ textAlign: "right", fontWeight: "bold", color: "#1a5c1a" }}>
                {recSup.total ? `$${recSup.total}` : "—"}
              </DocCell>
            </tr>
          </tbody>
        </table>

        {/* Supplier contact */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10 }}>
          <tbody>
            <tr>
              <DocCell w="25%" label>供應商 A 電話</DocCell>
              <DocCell w="25%">{supA.tel || " "}</DocCell>
              <DocCell w="25%" label>供應商 B 電話</DocCell>
              <DocCell w="25%">{supB.tel || " "}</DocCell>
            </tr>
            {higherPriceReason && (
              <tr>
                <DocCell label>採納較高報價原因</DocCell>
                <DocCell colSpan={3}>{higherPriceReason}</DocCell>
              </tr>
            )}
            {fewerSuppliersReason && (
              <tr>
                <DocCell label>少於兩名供應商原因</DocCell>
                <DocCell colSpan={3}>{fewerSuppliersReason}</DocCell>
              </tr>
            )}
          </tbody>
        </table>

        {/* Signatures */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
          <thead>
            <tr>
              <DocCell th w="33.3%">索取報價人</DocCell>
              <DocCell th w="33.3%">科組負責人</DocCell>
              <DocCell th w="33.3%">批核人</DocCell>
            </tr>
          </thead>
          <tbody>
            <tr>
              <DocCell style={{ height: 28 }}> </DocCell>
              <DocCell style={{ height: 28 }}> </DocCell>
              <DocCell style={{ height: 28 }}> </DocCell>
            </tr>
            <tr>
              <DocCell>
                {requestorName || "（姓名）"}
                {requestorRank ? `  ${requestorRank}` : ""}
              </DocCell>
              <DocCell>
                {deptHeadName || "（姓名）"}
                {deptHeadRank ? `  ${deptHeadRank}` : ""}
              </DocCell>
              <DocCell>
                {approverName || "（姓名）"}
                {approverRank ? `  ${approverRank}` : ""}
              </DocCell>
            </tr>
            <tr>
              <DocCell label>日期：{requestorDate || " "}</DocCell>
              <DocCell label>日期：{deptHeadDate || " "}</DocCell>
              <DocCell label>日期：{approverDate || " "}</DocCell>
            </tr>
          </tbody>
        </table>
      </div>
    </div>{/* end preview col */}
    </div>
  )
}

// ── Word preview cell ────────────────────────────────────────────────────────
function DocCell({
  children,
  w,
  colSpan,
  label,
  th,
  style,
}: {
  children?: React.ReactNode
  w?: string
  colSpan?: number
  label?: boolean
  th?: boolean
  style?: React.CSSProperties
}) {
  const base: React.CSSProperties = {
    border: "1px solid #000",
    padding: "3px 5px",
    verticalAlign: "top",
    width: w,
    background: th ? "#d9d9d9" : label ? "#f2f2f2" : "#fff",
    fontWeight: th || label ? "bold" : "normal",
    fontSize: "9px",
    ...style,
  }
  if (th) return <th colSpan={colSpan} style={base}>{children}</th>
  return <td colSpan={colSpan} style={base}>{children}</td>
}

// ── Supplier card sub-component ─────────────────────────────────────────────
function SupplierCard(props: {
  title: string
  recommended: boolean
  supplier: Supplier
  onChange: (patch: Partial<Supplier>) => void
  prices: string[]
  onPriceChange: (i: number, v: string) => void
  items: Item[]
  onCalcTotal: () => void
  inputCls: string
  inputStyle: React.CSSProperties
  labelCls: string
  labelStyle: React.CSSProperties
}) {
  const { title, recommended, supplier, onChange, prices, onPriceChange, items, onCalcTotal, inputCls, inputStyle, labelCls, labelStyle } = props
  return (
    <div
      className="rounded-input p-4"
      style={{
        border: `2px solid ${recommended ? "var(--color-curriculum)" : "var(--color-border)"}`,
        background: recommended ? "var(--color-curriculum-soft)" : "var(--color-surface)",
      }}
    >
      <h3 className="text-body font-semibold mb-3 flex items-center gap-2" style={{ color: "var(--color-ink-900)" }}>
        <ShoppingCart className="w-4 h-4" style={{ color: "var(--color-admin)" }} />
        {title}
        {recommended && <span className="text-caption" style={{ color: "var(--color-curriculum)" }}>✓ 推薦採納</span>}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-2 mb-3">
        <div>
          <label className={labelCls} style={labelStyle}>公司名稱</label>
          <input type="text" value={supplier.name} onChange={(e) => onChange({ name: e.target.value })} placeholder="公司全名" className={inputCls} style={inputStyle} />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>電話</label>
          <input type="text" value={supplier.tel} onChange={(e) => onChange({ tel: e.target.value })} placeholder="電話號碼" className={inputCls} style={inputStyle} />
        </div>
      </div>
      <table className="w-full text-left mb-2">
        <thead>
          <tr className="text-caption" style={{ color: "var(--color-ink-500)" }}>
            <th className="py-1 pr-2">物品</th>
            <th className="py-1 pr-2 w-28">單價 (HKD)</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td className="py-1 pr-2 text-caption" style={{ color: "var(--color-ink-700)" }}>
                {it.name.trim() || `（項目 ${i + 1}）`}
              </td>
              <td className="py-1 pr-2">
                <input
                  type="text"
                  inputMode="decimal"
                  value={prices[i] ?? ""}
                  onChange={(e) => onPriceChange(i, e.target.value)}
                  placeholder="0.00"
                  className={inputCls}
                  style={inputStyle}
                />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="py-1 pr-2 text-right text-caption font-medium" style={{ color: "var(--color-ink-700)" }}>總價</td>
            <td className="py-1 pr-2">
              <input
                type="text"
                value={supplier.total}
                onChange={(e) => onChange({ total: e.target.value })}
                placeholder="0.00"
                className={`${inputCls} font-semibold`}
                style={inputStyle}
              />
            </td>
          </tr>
        </tfoot>
      </table>
      <button
        type="button"
        onClick={onCalcTotal}
        className="text-caption px-2.5 py-1 rounded-input border"
        style={{ ...inputStyle, borderColor: "var(--color-admin)", color: "var(--color-admin)" }}
      >
        自動計算總價
      </button>
    </div>
  )
}

// ── Signature block sub-component ───────────────────────────────────────────
function SignBlock(props: {
  title: string
  name: string
  rank: string
  date: string
  onName: (v: string) => void
  onRank: (v: string) => void
  onDate: (v: string) => void
  inputCls: string
  inputStyle: React.CSSProperties
  labelCls: string
  labelStyle: React.CSSProperties
}) {
  const { title, name, rank, date, onName, onRank, onDate, inputCls, inputStyle, labelCls, labelStyle } = props
  return (
    <div>
      <strong className="text-caption block mb-2" style={{ color: "var(--color-ink-700)" }}>{title}</strong>
      <div className="grid grid-cols-[1fr_120px_140px] gap-2">
        <div>
          <label className={labelCls} style={labelStyle}>姓名</label>
          <input type="text" value={name} onChange={(e) => onName(e.target.value)} placeholder="姓名" className={inputCls} style={inputStyle} />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>職級</label>
          <input type="text" list="rank-list" value={rank} onChange={(e) => onRank(e.target.value)} placeholder="職級" className={inputCls} style={inputStyle} />
        </div>
        <div>
          <label className={labelCls} style={labelStyle}>日期</label>
          <input type="date" value={date} onChange={(e) => onDate(e.target.value)} className={inputCls} style={inputStyle} />
        </div>
      </div>
    </div>
  )
}
