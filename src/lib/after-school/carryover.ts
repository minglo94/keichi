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
    if(existing){if(existing.type!==r.type)errors.push(`${r.className} #${r.number} 補留與當日課後班類型不同，請先處理`);else existing.makeupFrom=existing.makeupFrom && existing.makeupFrom<from ? existing.makeupFrom : from;}
    else rows.push({...r,makeupFrom:from});
  }
  if(rows.length>1000)errors.push("合併補留後超過1000人，請由管理員處理");
  rows.sort((a,b)=>a.type.localeCompare(b.type)||a.className.localeCompare(b.className)||+a.number-+b.number);
  return {rows,errors};
}


// Each original sheet row is a debt until its own attendance box is checked.
// Group once by source date so rereading a full academic year stays linear.
export function outstandingAttendance(values:unknown[][],before:string,year:number) {
  if(values.length>50001)return {rows:[] as MakeupParticipant[],errors:['來源超過50000行，請按學年分表']};
  const header=(values[0]||[]).map(v=>String(v??'').trim());
  if(header.indexOf('出席')<0)return {rows:[] as MakeupParticipant[],errors:['缺少出席核取方塊欄，不能判斷補留']};
  const groups=new Map<string,unknown[][]>();
  const day=header.indexOf('日期');
  for(const row of values.slice(1)) {
    const date=parseDate(row[day],year);
    if(date && date>=`${year}-09-01` && date<`${year+1}-09-01` && date<before) {
      const rows=groups.get(date)||[];rows.push(row);groups.set(date,rows);
    }
  }
  const rows:MakeupParticipant[]=[];const errors:string[]=[];
  for(const date of Array.from(groups.keys()).sort()) {
    const missed=missedAttendance([values[0],...groups.get(date)!],date,year);
    errors.push(...missed.errors.map(error=>`${date}：${error}`));
    rows.push(...missed.rows.map(row=>({...row,makeupFrom:date})));
  }
  return {rows,errors};
}
