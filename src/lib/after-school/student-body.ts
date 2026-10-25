import { formatAnnouncement, parseDate, type Participant } from './model';

// Reconstruct from saved identifiers; never fall back to named staff prose.
export function studentAfterSchoolBody(run: {date:string;participants:unknown}): string {
  const unavailable = '課後班名單暫未能顯示，請向老師查詢。';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(run.date) || parseDate(run.date,2026)!==run.date || !Array.isArray(run.participants) || run.participants.length>1000) return unavailable;
  const rows: Participant[] = [];
  for (const item of run.participants) {
    if (!item || typeof item!=='object') return unavailable;
    const r=item as Record<string,unknown>;
    if (typeof r.className!=='string' || !/^[1-9][A-Z]$/.test(r.className) || typeof r.number!=='string' || !/^\d{2,3}$/.test(r.number) || (r.type!=='TOOL_UP' && r.type!=='POSITIVE')) return unavailable;
    rows.push({className:r.className,number:r.number,type:r.type});
  }
  try { return formatAnnouncement(run.date,rows).body; } catch { return unavailable; }
}
