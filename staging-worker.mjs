import application from './.open-next/worker.js';
import { routeRequest } from './migration-staging/staging-router.mjs';
export default {
  async fetch(request, env, ctx) {
    return routeRequest(request, env, ctx, () => application.fetch(request, env, ctx));
  }
};
