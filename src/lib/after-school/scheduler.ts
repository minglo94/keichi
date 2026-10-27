import { prisma } from '@/lib/prisma';
import { currentPhase, scheduleFor, instant } from './model';
import { preparationFor, preparationTarget } from './preparation';
import { prepareDay, type Reader } from './service';
import { deliverDay } from './delivery';
import { approverAllowed } from './repository';
export async function tick(
  options: { now?:Date; reader?:Reader; delivery?:typeof deliverDay } = {},
) {
  const now=options.now||new Date(), {date,time}=currentPhase(now);
  const config=await prisma.afterSchoolConfig.findUnique({where:{key:'school'}});
  if(!config?.enabled)return {status:'DISABLED'};
  if(!(await approverAllowed(config.approverId,true)))return {status:'APPROVER_REVOKED'};
  const target=preparationTarget(now), due=target===date && time>='06:00' ? instant(date,'06:00') : preparationFor(target);
  const targetSchedule=scheduleFor(target)!;
  let preparationError:string|undefined;
  if(now>=due && now<instant(target,targetSchedule.start)) {
    const prepared=await prisma.afterSchoolRun.findUnique({where:{date:target}});
    if(prepared?.status === 'FAILED' || !prepared?.automaticPreparedAt || prepared.automaticPreparedAt<due) {
      try {
        await prepareDay(target,config.approverId,{automatic:true,now,reader:options.reader});
      } catch(error) {
        // Tomorrow's source failure must not block today's already prepared push.
        preparationError=error instanceof Error?error.message:'整理失敗';
      }
    }
  }
  const schedule=scheduleFor(date);
  let result:{status:string};
  if(!schedule)result={status:'WEEKEND'};
  else if(time<'08:15')result={status:'NOT_DUE'};
  else {
    const run=await prisma.afterSchoolRun.findUnique({where:{date}});
    result=run?.status==='READY'
      ? await (options.delivery||deliverDay)(date,{clock:()=>options.now||new Date()})
      : {status:run?.status||'NO_RUN'};
  }
  return preparationError
    ? {...result,status:'PREPARATION_FAILED',deliveryStatus:result.status,preparationDate:target,preparationError}
    : {...result,preparationDate:target};
}


