export const prisma={afterSchoolConfig:{findUnique:async()=>({version:1,schoolYearStart:2026})},nonTeachingPeriod:{findFirst:async({where})=>globalThis.carryFixture.holidays.includes(where.startDate.lte.toISOString().slice(0,10))?{id:'holiday'}:null},afterSchoolRun:{findUnique:async()=>globalThis.carryFixture.run},classEnrollment:{findMany:async()=>[8,15].map(n=>({classId:'class',classNumber:String(n).padStart(2,'0'),class:{name:'1A'},student:{id:'s'+n,role:'STUDENT',name:'學生'+n}}))},activityAssignment:{findMany:async()=>[]}};
export async function readSource(){return globalThis.carryFixture.values;}
export async function withLease(date,fn){return fn('test');}export async function approverAllowed(){return true;}
export class AfterSchoolError extends Error{constructor(status,message){super(message);this.status=status;}}
export function overlaps(){return false;}export function windowOf(){return {};}
