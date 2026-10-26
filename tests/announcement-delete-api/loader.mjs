import {registerHooks} from 'node:module';
const root=new URL('../../',import.meta.url);
registerHooks({resolve(s,c,next){
 const stubs={'@/lib/prisma':'prisma','@/lib/auth':'auth','next/server':'next','zod':'zod'};
 if(stubs[s])return next(new URL(stubs[s]+'.mjs',import.meta.url).href,c);
 if(s.startsWith('@/'))return next(new URL('src/'+s.slice(2)+'.ts',root).href,c);
 try{return next(s,c);}catch(e){if(s.startsWith('.')&&!s.endsWith('.ts'))return next(s+'.ts',c);throw e;}
}});
