export function releaseDatabase(request, env) {
  const origin = new URL(request.url).origin;
  const expected = env.DAZHI_RELEASE_HOSTNAME && `https://${env.DAZHI_RELEASE_HOSTNAME}`;
  if (!expected || origin !== expected || env.AUTH_URL !== expected) return null;

  if ([env.AUTH_SECRET, env.AUTH_GOOGLE_ID, env.AUTH_GOOGLE_SECRET]
    .some(value => typeof value !== 'string' || !value.trim())) return null;

  try {
    const database = new URL(env.DATABASE_URL);
    if (database.protocol === 'postgresql:' && database.hostname.endsWith('.neon.tech') &&
        database.username && database.password &&
        ['require', 'verify-ca', 'verify-full'].includes(database.searchParams.get('sslmode'))) {
      return database.toString();
    }
  } catch {
    return null;
  }
  return null;
}
