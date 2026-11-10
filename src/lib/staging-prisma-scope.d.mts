type StagingGoogle = { clientId: string; clientSecret: string; email: string };
export function runScoped<T>(connectionString: string, fn: () => T, google?: StagingGoogle): T;
export function stagingAuthScope(): { google?: StagingGoogle } | undefined;
export function makeScopedProxy<T extends object>(makeClient: (connectionString: string) => T, fallback: () => T): T;
