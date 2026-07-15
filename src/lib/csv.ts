import { NextResponse } from "next/server"

/** Escape a value for a CSV cell (quote if it contains comma/quote/newline). */
export function csvCell(value: unknown): string {
  const s = value == null ? "" : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

/** Build a CSV string from a header row + data rows. */
export function toCsv(header: string[], rows: unknown[][]): string {
  const lines = [header.map(csvCell).join(",")]
  for (const row of rows) lines.push(row.map(csvCell).join(","))
  // Prepend BOM so Excel opens UTF-8 (Chinese) correctly.
  return "﻿" + lines.join("\r\n")
}

/** Wrap CSV text in a downloadable NextResponse. */
export function csvResponse(csv: string, filename: string): NextResponse {
  return new NextResponse(csv, {
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
