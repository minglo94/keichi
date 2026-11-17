import { authorized } from './staging-guard.mjs';
import { permittedInStaging } from './staging-policy.mjs';
import { runScoped } from '../src/lib/staging-prisma-scope.mjs';
import { prisma } from '../src/lib/prisma.ts';
import { databaseErrorCategory, databaseHealthSummary } from './staging-health.mjs';
export function stagingGoogleConfig(env) {
  const clientId = env.AUTH_GOOGLE_ID?.trim();
  const clientSecret = env.AUTH_GOOGLE_SECRET?.trim();
  const email = env.STAGING_GOOGLE_EMAIL?.trim().toLowerCase();
  if (clientId && clientSecret && email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { clientId, clientSecret, email };
  }
}
export async function routeRequest(request,env,ctx,next) {
  if (!(await authorized(request,env))) return new Response('Authentication required',{status:401,headers:{'WWW-Authenticate':'Basic realm="Dazhi staging acceptance", charset="UTF-8"','Cache-Control':'no-store'}});
  const url = new URL(request.url);
  if (request.method === 'GET' || request.method === 'HEAD') {
    // Next.js encodes brackets in chunk names for dynamic routes.
    if (url.pathname.startsWith('/_next/static/')) return env.ASSETS.fetch(request);
    if (url.pathname === '/favicon.ico' ||
        (url.pathname === '/_next/image' && url.searchParams.get('url') === '/logo.png')) {
      return env.ASSETS.fetch(new Request(new URL('/logo.png', url), { method: request.method }));
    }
  }
  const google = stagingGoogleConfig(env);
  if (!permittedInStaging(request, !!google)) return Response.json({error:'此操作在隔離測試環境中暫停'}, {status:403,headers:{'Cache-Control':'no-store'}});
  if (typeof env.STAGING_DATABASE_URL !== 'string' || !env.STAGING_DATABASE_URL.trim()) {
    return new Response('Staging database is not configured', { status:503, headers:{'Cache-Control':'no-store'} });
  }
  if (url.pathname === '/__migration/db-health' && request.method === 'GET') {
    try {
      const summary = await runScoped(env.STAGING_DATABASE_URL, () => databaseHealthSummary(prisma), google);
      return Response.json(summary, { headers:{'Cache-Control':'no-store'} });
    } catch (error) {
      const rawName = typeof error?.name === 'string' ? error.name : 'UnknownError';
      const safeName = rawName.replace(/[^A-Za-z0-9_]/g, '').slice(0,64) || 'UnknownError';
      const rawCode = typeof error?.code === 'string' ? error.code : '';
      const safeCode = /^[A-Z0-9_]{1,20}$/.test(rawCode) ? rawCode : undefined;
      const rawSqlState = typeof error?.meta?.code === 'string' ? error.meta.code : '';
      const safeSqlState = /^[A-Z0-9]{5}$/.test(rawSqlState) ? rawSqlState : undefined;
      const category = databaseErrorCategory(error);
      console.error('staging-db-health-failure', safeName, category);
      const probeStep = ['ping','ping_result','server_version','table_inventory'].includes(error?.probeStep) ? error.probeStep : undefined;
      return Response.json({ database:'unavailable', errorType:safeName, category, ...(probeStep ? { probeStep } : {}), ...(safeCode ? { errorCode:safeCode } : {}), ...(safeSqlState ? { sqlState:safeSqlState } : {}) }, { status:503, headers:{'Cache-Control':'no-store'} });
    }
  }
  const response = await runScoped(env.STAGING_DATABASE_URL, () => next(request,env,ctx), google);
  if (response.headers.get('content-type')?.startsWith('text/html')) {
    return new HTMLRewriter().on('link[rel="manifest"]', {
      element(link) { link.setAttribute('crossorigin', 'use-credentials'); },
    }).transform(response);
  }
  return response;
}
