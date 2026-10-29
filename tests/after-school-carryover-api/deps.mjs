export const prisma={afterSchoolConfig:{findUnique:async()=>({version:1,schoolYearStart:2026})},nonTeachingPeriod:{findFirst:async({where})=>globalThis.carryFixture.holidays.includes(where.startDate.lte.toISOString().slice(0,10))?{id:'holiday'}:null},afterSchoolRun:{findUnique:async()=>globalThis.carryFixture.run},classEnrollment:{findMany:async()=>[8,15,23].map(n=>({classId:'class',classNumber:String(n).padStart(2,'0'),class:{name:'1A'},student:{id:'s'+n,role:'STUDENT',name:'學生'+n}}))},activityAssignment:{findMany:async()=>[]}};
export async function readSource(){return globalThis.carryFixture.values;}
export async function withLease(date,fn){return fn('test');}export async function approverAllowed(){return true;}
export class AfterSchoolError extends Error{constructor(status,message){super(message);this.status=status;}}
export function overlaps(){return true;}export function windowOf(){return {};}

prisma.afterSchoolConfig.findUniqueOrThrow=async()=>({version:1,enabled:true,approverId:'admin'});
prisma.afterSchoolRun.update=async({data})=>Object.assign(globalThis.carryFixture.run,data);
prisma.afterSchoolRun.create=async({data})=>globalThis.carryFixture.run=data;
prisma.activityAssignment.findMany=async()=>globalThis.carryFixture.clashes||[];
export function setClash(){globalThis.carryFixture.clashes=[{studentId:'s8',activityId:'eca',activity:{title:'Choir',startTime:new Date('2026-10-28T08:00:00Z'),endTime:new Date('2026-10-28T09:00:00Z')}}];}

