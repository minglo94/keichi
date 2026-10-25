import { prisma } from '@/lib/prisma';
import { studentAfterSchoolBody } from './student-body';

export async function studentAnnouncementViews<T extends {id:string;body:string}>(items:T[]):Promise<T[]> {
  if (!items.length) return items;
  const runs=await prisma.afterSchoolRun.findMany({
    where:{announcementId:{in:items.map(item=>item.id)}},
    select:{announcementId:true,date:true,participants:true},
  });
  const bodies=new Map(runs.map(run=>[run.announcementId,studentAfterSchoolBody(run)]));
  return items.map(item=>bodies.has(item.id)?{...item,body:bodies.get(item.id)!}:item);
}

export async function studentActivityViews<T extends {id:string;description:string|null}>(items:T[]):Promise<T[]> {
  if (!items.length) return items;
  const groups=await prisma.afterSchoolGroup.findMany({
    where:{activityId:{in:items.map(item=>item.id)}},
    select:{activityId:true,run:{select:{date:true,participants:true}}},
  });
  const bodies=new Map(groups.map(group=>[group.activityId,studentAfterSchoolBody(group.run)]));
  return items.map(item=>bodies.has(item.id)?{...item,description:bodies.get(item.id)!}:item);
}
