import { authorized } from './staging-guard.mjs';
import { permittedInStaging } from './staging-policy.mjs';
export async function routeRequest(request,env,ctx,next) {
  if (!(await authorized(request,env))) return new Response('Authentication required',{status:401,headers:{'WWW-Authenticate':'Basic realm="Dazhi staging", charset="UTF-8"','Cache-Control':'no-store'}});
  if (!permittedInStaging(request)) return Response.json({error:'此操作在隔離測試環境中暫停'}, {status:403,headers:{'Cache-Control':'no-store'}});
  if (new URL(request.url).pathname.startsWith('/_next/static/')) return env.ASSETS.fetch(request);
  return next(request,env,ctx);
}
