type StagingGoogle = { clientId: string; clientSecret: string; email: string };
export function runScoped<T>(connectionString: string, fn: () => T, google?: StagingGoogle, candidate?: boolean): T;
export function runProductionScoped<T>(connectionString: string, fn: () => T): T;
export function stagingAuthScope(): { google?: StagingGoogle; candidate: boolean } | undefined;
export function makeScopedProxy<T extends object>(makeClient: (connectionString: string) => T, fallback: () => T): T;
