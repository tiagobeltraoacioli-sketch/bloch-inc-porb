# BlochAI inference gateway

This Worker adds `/blochai/` and three inference route patterns to the existing rednblue.space deployment. It does not replace the portal, its BlochAI agents, memory, reports or runs. Keep the exact route list in `wrangler.toml`; do not broaden it to `/api/porb/v1/blochai/*`.

Run `node scripts/build_blochai_assets.mjs` from the repository root before building or deploying with `deploy/blochai/wrangler.toml`. The staging directory contains only the three explicit public page assets.

Required server-only settings:

- `BLOCHAI_API_URL`: HTTPS origin for the private coordinator API.
- `BLOCHAI_API_TOKEN`: at least 32 characters; matches the coordinator's `BLOCKAI_PORTAL_TOKEN`.
- `PORB_AUTH_PEPPER`: at least 32 random characters for this Worker's rate-limit bucket hashing. It may be a separate secret from the portal's password pepper. Reading existing sessions requires only the shared database and SHA-256 session token hash.
- `PORB_DB`: existing portal D1 binding, already declared in the configuration.

The gateway accepts browser sessions only, checks organization membership on every request, injects tenant identifiers, requires same-origin action headers for submissions, and bounds request sizes, output sizes, upstream timeouts and organization quotas. Inference content is not stored in the portal audit log. The upstream must independently enforce its service token and task tenant isolation.

Unconfigured or unreachable inference returns an explicit unavailable status with unknown worker counts. The deployment target reflects the discovered A16-2Q configuration: 13 workers, 2 GB VRAM and 8 GB system RAM per worker. These values are not a claim that workers are connected.

Checks: `node --test tests/test_porb_blochai.mjs`; `node scripts/test_blochai_browser.mjs` with an installed Playwright browser (`PLAYWRIGHT_MODULE` may select its module path). Browser test model output is a local test fixture only.
