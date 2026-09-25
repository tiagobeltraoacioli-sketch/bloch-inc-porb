# Unified intelligence and partner API v1.1

Canonical portal: **https://rednblue.space/portal/**. The user confirmed this
spelling on 2026-09-25. Other spellings mentioned during planning are not deployment
targets. Existing accounts, organizations, passwords and sessions remain in the
same D1 database; no owner bootstrap or credential rotation is part of this release.

## Implemented workflows

- **Graphus modules** mounts System Map, Constellation, Oculum, Analytics, the
  research app and field catalog under the same portal host and browser session.
  Module HTML is session-gated. Public read adapters pass through the scoped
  `/api/porb/v1/graphus/*` gateway. Its fixed upstream is Graphus; credentials and
  private evidence are never forwarded. Original public Graphus remains available.
- **Address research** performs exact, asset-specific search across indexed saved
  analyses, with stable cursor pagination and explicit retained/indexed counts.
  New collections are indexed atomically. Opening older collections indexes them;
  the UI can index the retained set before searching. The index cascades on analysis
  retention. Ethereum/script hashes and Bitcoin Bech32 normalize case; Bitcoin
  Base58 preserves case. Validation checks format, not address checksum.
- **Investigations** supports creation, evidence attachment, close/reopen, JSON
  export and API deletion. Evidence is generated server-side from an authorized
  analysis. It retains source anchors, exact amounts, a descriptive score/model,
  endpoint nodes and up to 100 incident records in dataset order. Total and
  returned counts disclose truncation. Snapshot SHA-256 covers the serialized
  packet and survives source-analysis retention. No ownership claim is inferred.
- **Watchlists** evaluates exact references whenever the organization collects a
  new analysis, or when an analyst explicitly evaluates a retained analysis.
  One observation is stored per watch entry and analysis ID, with review status.
  Different analyses can overlap; matches are not counts of unique transactions.
  Deleting an entry removes its observations. Continuous indexing/scheduling,
  webhooks, email delivery and validated AML detection are not deployed.
- **Partner documentation** at `/developers/` describes 31 implemented operations,
  scopes, limits, pagination, errors, provenance and examples. `/developers/openapi.json`
  is OpenAPI 3.1, generated reproducibly from `scripts/build_partner_docs.mjs`.
  Documentation is public and contains no keys, private scores or customer evidence.

## Authorization and capacity

New scopes are `cases:read`, `cases:write`, `watchlists:read`, `watchlists:write`.
Old API keys gain no scopes automatically. Reading case evidence and observation
scores also requires `analyses:read` and `scores:read`. Session viewers cannot
mutate cases or watchlists. Every query binds the organization obtained from the
session/key. Foreign IDs return 404. Browser writes retain origin/action checks.
All private responses are non-cacheable, carry `X-Request-Id` and API version 1.1.

Capacity per organization: latest 50 analyses; 100 cases; 50 snapshots per case;
100 watched references; latest 500 observations. Existing collection limits remain
6/minute and 100/day, with 1–4 pages / 1,200 references / 4,000 records. The Graphus
gateway adds a shared 60/minute budget. Authentication remains 120 requests/minute
per user/key. `Retry-After` reports the remaining limiting window, including daily
collection limits. D1 writes use bounded batches and atomic insert predicates for
capacity checks; watch observations use a unique constraint to prevent duplicates.

## Build and release

Use Node 24. From the repository root:

```sh
python3 scripts/build_portal_modules.py
node scripts/build_partner_docs.mjs
node --test tests/test_porb_*.mjs tests/test_space_science.mjs tests/test_system_map*.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/test_porb_browser.mjs
```

`site/graphus/` is generated and ignored. The builder copies only selected public
HTML and public assets, adapts source routes and adds the portal module bar. Never
copy Graphus account databases, deployment configuration, Functions or private
operator files into this mount. Portal and Graphus account systems stay separate.

The additive migration `0002_intelligence.sql` adds reference indexing and private
workflow tables. Apply it before deploying the new API. Existing rows and login
secrets are preserved. D1 remote migrations make their own restore point.

```sh
cd site
wrangler d1 migrations apply bi-porb-portal --remote
wrangler pages deploy . --project-name rednblue-space --branch main
```

Deploy public Graphus from `graphus/` with project `bloch-graphus` so its source
Functions are included. Stage AML via `python3 scripts/build_aml_landing.py`, then
deploy the staged `public/` with project `aml-blochinc`. The public AML build never
contains the private database or gateway. It links to the unified portal and docs.

Rollback may redeploy the preceding portal build while leaving the additive tables
in place; do not drop evidence tables as a rollback step. The new workflow tables
are tenant-private and must be included in operator backup/retention procedures.

## Verification boundary

Unit and browser tests use isolated, explicitly synthetic source fixtures. Live
checks use public source facts through the deployed private gateway. They must
report actual source failures, never substitute fixtures. Keep all production
credentials and credential handoff files outside Git and public assets.
