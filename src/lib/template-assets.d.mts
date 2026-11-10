export function readTemplateAsset(filename: string, assets: {fetch(url: string): Promise<Response>} | null, readLocal: (filename: string) => Buffer): Promise<Buffer>;
