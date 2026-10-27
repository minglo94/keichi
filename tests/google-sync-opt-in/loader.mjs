import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,next){if(s==='@/lib/prisma')return next(new URL('deps.mjs',import.meta.url).href,c);if(s==='@/lib/google-calendar')return next(new URL('../../src/lib/google-calendar.ts',import.meta.url).href,c);try{return next(s,c);}catch(e){if(s.startsWith('.')&&!s.endsWith('.ts'))return next(s+'.ts',c);throw e;}}});
