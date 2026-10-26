export type AnnouncementDeleteActor = {
  id: string;
  role: string;
  chairedCommittees: ReadonlySet<string>;
};
export function canDeleteAnnouncement(
  announcement: {authorId:string;committee:string|null},
  actor: AnnouncementDeleteActor|null,
  managed = false,
): boolean {
  if (managed || !actor || (actor.role !== 'ADMIN' && actor.role !== 'TEACHER')) return false;
  return actor.role === 'ADMIN' || announcement.authorId === actor.id ||
    (!!announcement.committee && actor.chairedCommittees.has(announcement.committee));
}
