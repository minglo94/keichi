import { prisma } from '@/lib/prisma';
import { canDeleteAnnouncement, type AnnouncementDeleteActor } from './announcement-delete-policy';

// Re-read role and chair assignments; never use stale JWT privileges to delete.
export async function announcementDeleteActor(id:string):Promise<AnnouncementDeleteActor|null> {
  const user=await prisma.user.findUnique({where:{id},select:{id:true,role:true}});
  if (!user || (user.role!=='TEACHER' && user.role!=='ADMIN')) return null;
  const chairs=user.role==='TEACHER'
    ? await prisma.committeeRole.findMany({where:{userId:id,isChair:true},select:{committee:true}})
    : [];
  return {...user,chairedCommittees:new Set(chairs.map(c=>c.committee))};
}

export async function announcementDeleteViews<T extends {id:string;authorId:string;committee:string|null}>(items:T[],userId:string) {
  const actor=await announcementDeleteActor(userId);
  const managed=items.length ? await prisma.afterSchoolRun.findMany({
    where:{announcementId:{in:items.map(a=>a.id)}},select:{announcementId:true},
  }) : [];
  const protectedIds=new Set(managed.map(run=>run.announcementId));
  return items.map(item=>({...item,canDelete:canDeleteAnnouncement(item,actor,protectedIds.has(item.id))}));
}
