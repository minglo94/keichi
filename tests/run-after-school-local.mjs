// Run ONLY against a new disposable, already-migrated local database.
import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { createWriteStream } from "node:fs";
import { fileURLToPath } from "node:url";
const cwd = fileURLToPath(new URL("../", import.meta.url));
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw new Error("Local disposable DB required");
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const env = {
  ...process.env,
  AUTH_URL: "http://127.0.0.1:3101",
  NEXTAUTH_URL: "http://127.0.0.1:3101",
  AUTH_SECRET: "synthetic-local-only-secret-32-characters",
  AUTH_GOOGLE_ID: "synthetic",
  AUTH_GOOGLE_SECRET: "synthetic",
  AFTERSCHOOL_CRON_SECRET: "synthetic-local-cron-key-at-least-32-characters",
  AFTERSCHOOL_GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    client_email: "synthetic@test.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
  }),
};
async function run(file) {
  const child = spawn(process.execPath, ["--import", "tsx", file], {
    cwd,
    env,
    stdio: "inherit",
  });
  const code = await new Promise((r) => child.on("exit", r));
  if (code !== 0) throw new Error(file + " failed");
}
await run("tests/after-school-integration.ts");
const log = createWriteStream("/tmp/keichi-after-school-local-next.log");
const app = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "dev", "-p", "3101"],
  {
    cwd,
    env: {
      ...env,
      AFTERSCHOOL_LOCAL_HTTP_TEST: "synthetic-only",
      NODE_OPTIONS:
        "--import " +
        fileURLToPath(
          new URL("after-school-http-fixture.mjs", import.meta.url),
        ),
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
app.stdout.pipe(log);
app.stderr.pipe(log);
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(env.AUTH_URL + "/api/auth/csrf")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw new Error("Next server did not start");
  await run("tests/after-school-http.ts");
} finally {
  app.kill("SIGTERM");
  log.end();
}
