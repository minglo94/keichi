# Dazhi Cloudflare release

The OpenNext build requires `html_handling` and `not_found_handling` set to
`none`, so build with `wrangler.release-build.jsonc`. The production wrapper
uses `env.ASSETS.fetch(request)` before Next.js; uploading with those two
settings caused Cloudflare 1102 on the school hostname. Upload with
`wrangler.release.jsonc`, whose asset routing was verified on the live site.

1. Set `NEXT_PUBLIC_VAPID_PUBLIC_KEY` in the build environment to the public
   key paired with the deployed `VAPID_PRIVATE_KEY`. Never commit the private
   key. The browser needs the public key at build time; the Worker needs the
   same public key as a runtime binding.
2. Build: `pnpm exec opennextjs-cloudflare build -c migration-staging/wrangler.release-build.jsonc`.
3. Upload a version with Wrangler using `--keep-vars`,
   `--config migration-staging/wrangler.release.jsonc`, and
   `--var NEXT_PUBLIC_VAPID_PUBLIC_KEY:<public-key>`. Preserve existing secrets
   and compare binding names and types with the deployed version.
4. Deploy that exact version with the school account's Cloudflare CLI. Check
   `/login`, the authenticated teacher homepage, Ask Keida, and the notification
   bell before treating the version as accepted. Roll back to the last known
   good version if any of these fail.

The broadcast page is admin-only and excludes the sender. For a device push
test, choose **指定教師** and one test recipient; do not use **全體教職員**.
