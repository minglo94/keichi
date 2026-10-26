import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){
 if(['@/lib/prisma','@/lib/clash'].includes(s)||(c.parentURL?.endsWith('/service.ts')&&['./source','./repository','./http'].includes(s)))return next(new URL('deps.mjs',import.meta.url).href,c);
 if(s==='@/lib/hk-date')return next(new URL('../../src/lib/hk-date.ts',import.meta.url).href,c);
 try{return next(s,c);}catch(e){if(s.startsWith('.')&&!s.endsWith('.ts'))return next(s+'.ts',c);throw e;}
}});
