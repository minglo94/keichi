import { authorized } from './staging-guard.mjs';
import { permittedInStaging } from './staging-policy.mjs';
export async function routeRequest(request,env,ctx,next) {
  if (!(await authorized(request,env))) return new Response('Authentication required',{status:401,headers:{'WWW-Authenticate':'Basic realm="Dazhi staging", charset="UTF-8"','Cache-Control':'no-store'}});
  const url = new URL(request.url);
  if (request.method === 'GET' || request.method === 'HEAD') {
    // Next.js encodes brackets in chunk names for dynamic routes.
    if (url.pathname.startsWith('/_next/static/')) return env.ASSETS.fetch(request);
    if (url.pathname === '/favicon.ico' ||
        (url.pathname === '/_next/image' && url.searchParams.get('url') === '/logo.png')) {
      return env.ASSETS.fetch(new Request(new URL('/logo.png', url), { method: request.method }));
    }
  }
  if (!permittedInStaging(request)) return Response.json({error:'此操作在隔離測試環境中暫停'}, {status:403,headers:{'Cache-Control':'no-store'}});
  const response = await next(request,env,ctx);
  if (response.headers.get('content-type')?.startsWith('text/html')) {
    return new HTMLRewriter().on('link[rel="manifest"]', {
      element(link) { link.setAttribute('crossorigin', 'use-credentials'); },
    }).transform(response);
  }
  return response;
}
