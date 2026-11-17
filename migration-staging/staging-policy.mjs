const allowedWrites = new Map([
  ['/api/auth/callback/credentials', new Set(['POST'])],
  ['/api/auth/signout', new Set(['POST'])],
  ['/api/todos', new Set(['POST'])],
  ['/api/timetable/common-free', new Set(['POST'])],
  ['/api/quotation/generate', new Set(['POST'])],
  ['/api/activity-docs/generate', new Set(['POST'])],
  ['/api/teacher/blackboard/schedule', new Set(['PUT'])],
]);
export function permittedInStaging(request, googleEnabled = false) {
  const path = new URL(request.url).pathname;
  const method = request.method.toUpperCase();
  if (path.includes('%') || path === '/_next/image') return false;
  if (path === '/api/cron' || path.startsWith('/api/cron/') || path === '/api/oauth' || path.startsWith('/api/oauth/')) return false;
  if (path === '/api/auth/signin/google') return googleEnabled && method === 'POST';
  if (path.startsWith('/api/auth/signin/')) return false;
  if (path === '/api/auth/callback/google') return googleEnabled && method === 'GET';
  if (path.startsWith('/api/auth/callback/') && path !== '/api/auth/callback/credentials') return false;
  if (method === 'GET' || method === 'HEAD') return true;
  if (allowedWrites.get(path)?.has(method)) return true;
  return /^\/api\/todos\/[A-Za-z0-9_-]+$/.test(path) && (method === 'PATCH' || method === 'DELETE');
}
