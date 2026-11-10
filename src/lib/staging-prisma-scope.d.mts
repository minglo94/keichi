export function runScoped<T>(connectionString: string, fn: () => T): T;
export function makeScopedProxy<T extends object>(makeClient: (connectionString: string) => T, fallback: () => T): T;
