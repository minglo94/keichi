# Keichi Cloudflare production release

The canonical Worker is `dazhi-production`. The root `wrangler.jsonc` targets
that Worker. The build uses `wrangler.release-build.jsonc` because OpenNext
requires different asset routing from the actual deployment.

For Workers Builds, select the **Production** settings:

| Field | Value |
| --- | --- |
| Repository | `minglo94/keichi` |
| Production branch | `main` |
| Root directory | `/` |
| Build command | `pnpm run cf:build` |
| Deploy command | `pnpm run cf:deploy` |

Add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` under **Production → Build variables and
secrets**. Use the public key paired with the existing runtime
`VAPID_PRIVATE_KEY` so existing subscriptions remain valid. The build fails
early if the public key is missing. The deploy command passes the same public
key to the Worker and keeps existing dashboard variables and secrets.

Keep the existing production Neon connection in the Worker's `DATABASE_URL`
secret. The release wrapper accepts a TLS Neon PostgreSQL connection and uses
the Prisma Neon adapter. Before this release, verify the live Neon database
contains the nullable `Prompt.schoolSubject` column. If it does not, apply
`prisma/migrations/202611170001_prompt_school_subject/migration.sql` to the
production database with a database role permitted to alter the table.

For a manual release, build with the same public key and upload first:

```sh
pnpm run cf:build
npx --yes wrangler@4.158.0 versions upload --config wrangler.jsonc \
  --var "NEXT_PUBLIC_VAPID_PUBLIC_KEY:${NEXT_PUBLIC_VAPID_PUBLIC_KEY:?Set the production VAPID public key}"
```

Compare binding names and types with the current production version before
deploying the exact uploaded version. Check `/login`, the signed-in teacher
homepage, prompts, Ask Keida, and the notification bell. Roll back to the last
known good Cloudflare version if these checks fail.

For a device push test, choose **指定教師** and one test recipient.
