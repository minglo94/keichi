export const prisma={
 user:{findUnique:async()=>globalThis.fixture.user},
 committeeRole:{findMany:async()=>globalThis.fixture.chairs.map(committee=>({committee}))},
 announcement:{findUnique:async()=>globalThis.fixture.announcement,delete:async()=>{globalThis.fixture.deleted++;return globalThis.fixture.announcement;}},
 afterSchoolRun:{findFirst:async()=>globalThis.fixture.managed?{date:'2026-10-26'}:null,findMany:async()=>globalThis.fixture.managed?[{announcementId:'ann'}]:[]},
};
