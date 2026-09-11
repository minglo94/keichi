// Pure roster-text parsing, with no database access, so client components can
// use the same rules the server matches with.
//
// Everything is compared on a normalised key, on both sides, so a roster can be
// written the way the school actually writes it.

/** "S4A" / "F.4A" / "4a" / "中四A" / " 4 A " all key to "4A". */
export function classKey(s: string): string {
  let v = s.trim().toUpperCase()
  v = v.replace(/中([一二三四五六])/g, (_, z: string) => String("一二三四五六".indexOf(z) + 1))
  v = v.replace(/[^A-Z0-9]/g, "")      // spaces, dots, dashes, full-width punctuation
  v = v.replace(/^[SF](?=\d)/, "")     // S4A / F4A → 4A
  return v
}

/** "01" / "1" / " 1 " all key to "1". */
export function numKey(s: string): string {
  return s.trim().replace(/^0+(?=\d)/, "").toLowerCase()
}

/** Ignore every kind of space, including the full-width one Excel loves. */
export function nameKey(s: string): string {
  return s.replace(/[\s　 ​]+/g, "").toLowerCase()
}

/**
 * Split one pasted line into (班別, 學號, 姓名).
 *
 * Accepts tabs, commas, and runs of spaces, because a roster copied out of a
 * web page arrives space-separated while Excel gives tabs. A Chinese name has
 * no internal space, so the leftovers join back into the name.
 */
export function splitRosterLine(line: string): { className: string; studentId: string; name: string } {
  const parts = line.replace(/[　 ]/g, " ").split(/[\t,，]+|\s{1,}/).map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0) return { className: "", studentId: "", name: "" }
  if (parts.length === 1) {
    // A lone token is a name or an email, never a class.
    return { className: "", studentId: "", name: parts[0] }
  }
  // 班別 學號 [姓名…] — the number is only a number.
  if (/^\d+$/.test(parts[1])) {
    return { className: parts[0], studentId: parts[1], name: parts.slice(2).join(" ") }
  }
  // 班別 姓名 (no number given)
  return { className: parts[0], studentId: "", name: parts.slice(1).join(" ") }
}

