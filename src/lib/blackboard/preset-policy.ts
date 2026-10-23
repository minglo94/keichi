import { canonicalClassName } from "./policy";
export function presetClassPlan(rows: { id: string; name: string }[]) {
  const seen = new Set<string>(),
    classes: { id: string; name: string; password: string }[] = [];
  let skipped = 0;
  for (const row of rows) {
    const name = canonicalClassName(row.name);
    if (!/^[1-6][A-Z]$/.test(name)) {
      skipped++;
      continue;
    }
    if (seen.has(name)) throw new Error("班別名稱重複，請先修正名冊");
    seen.add(name);
    classes.push({ id: row.id, name, password: "keichi" + name.toLowerCase() });
  }
  return {
    classes: classes.sort((a, b) => a.name.localeCompare(b.name)),
    skipped,
  };
}
