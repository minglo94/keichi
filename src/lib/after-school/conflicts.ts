// READY runs may carry this explicitly accepted warning in the legacy status
// message field. Arbitrary errors must never be treated as deliverable notes.
const PREFIX = "備註：已確認接受時間重疊，仍按設定提醒。";
export function conflictNote(warnings: string[]) {
  return warnings.length ? PREFIX + warnings.join("；") : null;
}
export function isAcceptedConflictNote(note: string | null) {
  return !!note && note.startsWith(PREFIX) && note.length > PREFIX.length;
}
