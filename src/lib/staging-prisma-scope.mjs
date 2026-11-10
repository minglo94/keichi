import { AsyncLocalStorage } from 'node:async_hooks';
const key=Symbol.for('dazhi.migration.staging.prisma.context.v1');
const storage=globalThis[key] ??= new AsyncLocalStorage();
export function runScoped(connectionString, fn, google, candidate = false){ return storage.run({connectionString,client:null,google,candidate}, fn); }
export function runProductionScoped(connectionString, fn) {
 return storage.run({ connectionString, client: null, production: true }, fn);
}
export function stagingAuthScope() {
 const scope = storage.getStore();
 return scope?.production ? undefined : scope;
}
export function makeScopedProxy(makeClient, fallback){
 return new Proxy({}, {get(_target,prop){
   const scope=storage.getStore();
   const client=scope ? (scope.client ??= makeClient(scope.connectionString)) : fallback();
   const value=Reflect.get(client,prop,client);
   return typeof value==='function' ? value.bind(client) : value;
 }});
}
