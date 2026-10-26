export const prisma={afterSchoolConfig:{findUnique:async()=>({enabled:true,approverId:'admin'})},afterSchoolRun:{findUnique:async({where})=>globalThis.scheduleFixture.runs[where.date]||null}};
export async function approverAllowed(){return true;}
export async function prepareDay(date,actor,options){const f=globalThis.scheduleFixture;f.prepared.push(date);if(f.fail)throw Error('source failed');f.runs[date]={status:'READY',automaticPreparedAt:options.now};}
export async function deliverDay(date){globalThis.scheduleFixture.delivered.push(date);return {status:'DONE'};}
