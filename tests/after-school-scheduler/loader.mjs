import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){
 if(s==='@/lib/prisma'||(c.parentURL?.endsWith('/scheduler.ts')&&['./service','./delivery','./repository'].includes(s)))return next(new URL('deps.mjs',import.meta.url).href,c);
 try{return next(s,c);}catch(e){if(s.startsWith('.')&&!s.endsWith('.ts'))return next(s+'.ts',c);throw e;}
}});
