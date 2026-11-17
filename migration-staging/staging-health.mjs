export function databaseErrorCategory(error) {
  const messages = [error?.meta?.message, error?.message, error?.cause?.meta?.message, error?.cause?.message]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  if (/permission denied|not authorized|insufficient privilege/.test(messages)) return 'permission_denied';
  if (/relation (?:.* )?does not exist|table (?:.* )?does not exist|undefined table|schema (?:.* )?does not exist/.test(messages)) return 'schema_error';
  if (/timeout|timed out|connection refused|connection reset|could not connect|connect error/.test(messages)) return 'connection_error';
  return 'database_query_error';
}

class DatabaseHealthProbeError extends Error {
  constructor(step, cause) {
    super('Staging database health probe failed', { cause });
    this.name = 'DatabaseHealthProbeError';
    this.probeStep = step;
  }
}

export async function databaseHealthSummary(prisma) {
  const query = async (step, run) => {
    try { return await run(); }
    catch (error) { throw new DatabaseHealthProbeError(step, error); }
  };
  const ping = (await query('ping', () => prisma.$queryRaw`SELECT 1 AS ok`))?.[0];
  if (Number(ping?.ok) !== 1) throw new DatabaseHealthProbeError('ping_result');
  const versionResult = (await query('server_version', () => prisma.$queryRaw`SELECT current_setting('server_version_num')::int AS server_version_num`))?.[0];
  const tablesResult = (await query('table_inventory', () => prisma.$queryRaw`SELECT count(*)::int AS public_tables FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`))?.[0];
  const version = Number(versionResult?.server_version_num);
  const tables = Number(tablesResult?.public_tables);
  if (!Number.isFinite(version) || !Number.isFinite(tables)) {
    throw new Error('Invalid database health result');
  }
  return { database: 'ok', major: Math.floor(version / 10_000), tables };
}
