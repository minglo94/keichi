const conn={id:'conn',googleCalendarId:'cal',accessToken:'test',tokenExpiresAt:new Date('2099-01-01')};
export const prisma={
 googleCalendarConnection:{findUnique:async()=>{globalThis.syncFixture.reads++;return conn;},findMany:async()=>[]},
 committeeRole:{findMany:async()=>[]},groupMember:{findMany:async()=>[]},studentGroup:{findMany:async()=>[]},
 calendarEvent:{findMany:async({where})=>{globalThis.syncFixture.filters.push(where);return [];},update:async({data})=>{globalThis.syncFixture.updates.push(data);},create:async({data})=>({...data,id:'event',googleEventId:null})},
 activity:{update:async()=>({})},
};
prisma.googleCalendarConnection.update=async()=>({});
