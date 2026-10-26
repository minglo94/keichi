import { parseRows, parseDate, type Participant } from './model';
export type MakeupParticipant = Participant & {makeupFrom?:string};
export function missedAttendance(values:unknown[][],date:string,year:number) {
  const header=(values[0]||[]).map(v=>String(v??'').trim());
  const attendance=header.indexOf('出席'), day=header.indexOf('日期');
  if(attendance<0)return {rows:[] as Participant[],errors:['缺少出席核取方塊欄，不能判斷補留']};
  const missed:unknown[][]=[values[0]];const errors:string[]=[];
  values.slice(1).forEach((row,i)=>{
    if(parseDate(row[day],year)!==date)return;
    const mark=row[attendance];
    if(mark===true||String(mark).toUpperCase()==='TRUE')return;
    if(mark===false||mark==null||mark===''||String(mark).toUpperCase()==='FALSE')missed.push(row);
    else errors.push(`第${i+2}行出席核取方塊值無效`);
  });
  const parsed=parseRows(missed,date,year);
  return {rows:parsed.rows,errors:[...errors,...parsed.errors]};
}
export function mergeMakeup(base:Participant[],missed:Participant[],from:string) {
  const rows:MakeupParticipant[]=base.map(r=>({...r}));const errors:string[]=[];
  for(const r of missed){
    const existing=rows.find(x=>x.className===r.className&&x.number===r.number);
    if(existing){if(existing.type!==r.type)errors.push(`${r.className} #${r.number} 補留與當日課後班類型不同，請先處理`);else existing.makeupFrom=from;}
    else rows.push({...r,makeupFrom:from});
  }
  if(rows.length>1000)errors.push("合併補留後超過1000人，請由管理員處理");
  rows.sort((a,b)=>a.type.localeCompare(b.type)||a.className.localeCompare(b.className)||+a.number-+b.number);
  return {rows,errors};
}
