import { hkYmd, hkHm, hkWeekday, hkDayStart } from '../hk-date';
function shift(date:string,days:number) {
  return hkYmd(new Date(+hkDayStart(date)+days*86400000));
}
export function preparationFor(date:string):Date {
  return new Date(`${shift(date,hkWeekday(date)===1?-3:-1)}T16:00:00+08:00`);
}
export function preparationTarget(now:Date):string {
  let date=hkYmd(now);
  if(hkHm(now)>='16:00')date=shift(date,1);
  while([0,6].includes(hkWeekday(date)))date=shift(date,1);
  return date;
}
