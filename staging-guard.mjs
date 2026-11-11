export async function authorized(request, env) {
  if (typeof env.STAGING_BASIC_AUTH !== 'string' || env.STAGING_BASIC_AUTH.length < 8) return false;
  const header = request.headers.get('authorization');
  if (!header || !header.startsWith('Basic ')) return false;
  let supplied;
  try { supplied = atob(header.slice(6)); } catch { return false; }
  const encode = new TextEncoder();
  const [a,b] = await Promise.all([supplied, env.STAGING_BASIC_AUTH].map(x => crypto.subtle.digest('SHA-256', encode.encode(x))));
  let different = 0;
  for (let i=0;i<32;i++) different |= new Uint8Array(a)[i] ^ new Uint8Array(b)[i];
  return different === 0;
}
