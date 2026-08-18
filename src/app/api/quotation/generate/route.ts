import { NextRequest, NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { isTeacherOrAdmin } from "@/lib/roles"
import { z } from "zod"
import fs from "fs"
import path from "path"
import PizZip from "pizzip"
import Docxtemplater from "docxtemplater"

// Wingdings 2 checkbox glyphs (must match template's checkbox run font).
const CHECKED = "" // ■ checked
const UNCHECKED = "" // □ empty
const box = (on: boolean) => (on ? CHECKED : UNCHECKED)

const supplierSchema = z.object({
  name:   z.string().max(200).default(""),
  tel:    z.string().max(100).default(""),
  // One unit price per item; null = blank line (keeps alignment with item rows).
  prices: z.array(z.number().min(0).max(10_000_000).nullable()).max(3).default([]),
  total:  z.number().min(0).max(100_000_000).default(0),
})

const itemSchema = z.object({
  name: z.string().max(200).default(""),
  qty:  z.union([z.number().int().min(1), z.string()]).default(""),
})

const generateSchema = z.object({
  quotationDate:        z.string().max(20),
  quoteMethod:          z.enum(["phone", "fax", "mail", "other"]),
  quoteMethodOther:     z.string().max(200).default(""),
  quotationName:        z.string().max(200).default(""),
  items:                z.array(itemSchema).max(3).default([]),
  supplierA:            supplierSchema,
  supplierB:            supplierSchema,
  recommended:          z.enum(["A", "B"]),
  useLowerPrice:        z.boolean().default(true),
  higherPriceReason:    z.string().max(500).default(""),
  fewerSuppliersReason: z.string().max(500).default(""),
  itemCategory:         z.enum(["fixed", "consumable", "other"]),
  categoryOther:        z.string().max(200).default(""),
  department:           z.string().max(100).default(""),
  purpose:              z.string().max(300).default(""),
  deliveryDate:         z.string().max(20).default(""),
  fundingSource:        z.string().max(200).default(""),
  requestorName:        z.string().max(100).default(""),
  requestorRank:        z.string().max(100).default(""),
  requestorDate:        z.string().max(20).default(""),
  deptHeadName:         z.string().max(100).default(""),
  deptHeadRank:         z.string().max(100).default(""),
  deptHeadDate:         z.string().max(20).default(""),
  approverName:         z.string().max(100).default(""),
  approverRank:         z.string().max(100).default(""),
  approverDate:         z.string().max(20).default(""),
})

const TEMPLATE_PATH = path.join(process.cwd(), "public", "templates", "quotation.docx")

// Pad an items array to exactly 3 entries (template has 3 fixed item slots).
function pad3<T>(arr: T[]): (T | "")[] {
  return [arr[0] ?? "", arr[1] ?? "", arr[2] ?? ""]
}

function fmtNum(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return ""
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Convert YYYY-MM-DD to traditional Chinese date format
function fmtDate(dateStr: string): string {
  if (!dateStr) return "___________"

  try {
    // Try parsing YYYY-MM-DD or YYYY/MM/DD
    const formats = [
      /^(\d{4})-(\d{1,2})-(\d{1,2})$/,  // YYYY-MM-DD
      /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/ // YYYY/MM/DD
    ]

    for (const fmt of formats) {
      const match = dateStr.match(fmt)
      if (match) {
        const [, year, month, day] = match
        return `  ${year} 年    ${parseInt(month)} 月  ${parseInt(day)}   日`
      }
    }

    // If parsing fails, return as-is
    return dateStr
  } catch {
    return dateStr
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isTeacherOrAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const d = generateSchema.parse(await req.json())

  // Items padded to 3 slots for the template's fixed paragraphs.
  const names = pad3(d.items.map((i) => i.name))
  const qtys = pad3(d.items.map((i) => String(i.qty ?? "")))

  // Price lines preserve blank slots (null → "") so they stay aligned with item rows.
  const supAPriceLines = d.supplierA.prices.map(fmtNum)
  const supBPriceLines = d.supplierB.prices.map(fmtNum)

  // Map form data → docxtemplater keys (all keys defaulted so render never throws on a missing field).
  const data = {
    quotationDate: fmtDate(d.quotationDate),
    methodPhoneBox: box(d.quoteMethod === "phone"),
    methodFaxBox:   box(d.quoteMethod === "fax"),
    methodMailBox:  box(d.quoteMethod === "mail"),
    methodOtherBox: box(d.quoteMethod === "other"),
    quoteMethodOther: d.quoteMethod === "other" ? d.quoteMethodOther : "",
    recommendedSupplier: d.recommended === "A" ? d.supplierA.name : d.supplierB.name,
    priceLowerBox:  box(d.useLowerPrice),
    priceHigherBox: box(!d.useLowerPrice),
    higherPriceReason:    d.higherPriceReason,
    fewerSuppliersReason: d.fewerSuppliersReason,
    catFixedBox:     box(d.itemCategory === "fixed"),
    catConsumableBox: box(d.itemCategory === "consumable"),
    catOtherBox:     box(d.itemCategory === "other"),
    categoryOther:   d.itemCategory === "other" ? d.categoryOther : "",
    department:    d.department,
    purpose:       d.purpose,
    deliveryDate:  d.deliveryDate,
    fundingSource: d.fundingSource,
    requestorName: d.requestorName,
    requestorRank: d.requestorRank,
    requestorDate: fmtDate(d.requestorDate),
    deptHeadName:  d.deptHeadName,
    deptHeadRank:  d.deptHeadRank,
    deptHeadDate:  fmtDate(d.deptHeadDate),
    approverName:  d.approverName,
    approverRank:  d.approverRank,
    approverDate:  fmtDate(d.approverDate),
    quotationName: d.quotationName,
    item1Name: names[0], item2Name: names[1], item3Name: names[2],
    item1Qty:  qtys[0],  item2Qty:  qtys[1],  item3Qty:  qtys[2],
    supAName:   d.supplierA.name,
    supATel:    d.supplierA.tel,
    supAPrices: supAPriceLines.join("\n"),
    supATotal:  fmtNum(d.supplierA.total),
    supAAdopt:  d.recommended === "A" ? "✓" : "",
    supBName:   d.supplierB.name,
    supBTel:    d.supplierB.tel,
    supBPrices: supBPriceLines.join("\n"),
    supBTotal:  fmtNum(d.supplierB.total),
    supBAdopt:  d.recommended === "B" ? "✓" : "",
  }

  let buf: Uint8Array
  try {
    const content = fs.readFileSync(TEMPLATE_PATH)
    const zip = new PizZip(content)
    const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true })
    doc.render(data)
    buf = doc.getZip().generate({
      type: "uint8array",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }) as Uint8Array
  } catch (err) {
    console.error("[quotation/generate] render error:", err)
    return NextResponse.json({ error: "文件生成失敗，請檢查範本或欄位資料。" }, { status: 500 })
  }

  const deptSafe = (d.department || "科組").replace(/[\\/:*?"<>|]/g, "_").slice(0, 40)
  const filename = encodeURIComponent(`報價表_${deptSafe}.docx`)
  const mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"

  // Copy into a real ArrayBuffer (TS lib's Uint8Array<ArrayBufferLike> isn't
  // directly assignable to BodyInit/BlobPart; ArrayBuffer is).
  const ab = new ArrayBuffer(buf.byteLength)
  new Uint8Array(ab).set(buf)

  return new NextResponse(ab, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="quotation.docx"; filename*=UTF-8''${filename}`,
      "Content-Length": String(ab.byteLength),
    },
  })
}
