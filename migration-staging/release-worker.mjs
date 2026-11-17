import application from '../.open-next/worker.js';
import { runProductionScoped } from '../src/lib/staging-prisma-scope.mjs';
import { releaseDatabase } from './release-request.mjs';

export default {
  async fetch(request, env, ctx) {
    const connection = releaseDatabase(request, env);
    if (!connection) {
      return new Response('Unavailable', { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      const url = new URL(request.url);
      if (url.pathname === '/_next/image' && url.searchParams.get('url') === '/logo.png') {
        return env.ASSETS.fetch(new Request(new URL('/logo.png', url), { method: request.method }));
      }
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
    }
    return runProductionScoped(connection, () => application.fetch(request, env, ctx));
  },
};
