> **Retired 2026-10-06.** BlochAI is no longer offered on rednblue.space. This Worker keeps its
> routes only to answer 404 on `/blochai`, `/blochai/*` and `/api/porb/v1/blochai/*`. The
> description below records the former service.

# BlochAI private inference and research gateway

This Worker adds `/blochai/` and narrowly scoped inference/research routes to the existing `rednblue.space` deployment. It does not replace the portal, its existing BlochAI agents, memory, reports or runs. Keep the explicit route list in `wrangler.toml`; never broaden it to `/api/porb/v1/blochai/*`.

The standalone page supports organization-private prompts and optional chain research. Research selects Bitcoin, Ethereum or Bloch, a public network/address/transaction target, a response style, optional date bounds and personal instructions. Public source requests contain only the validated chain identifier and fixed query parameters; personal instructions, prompts, saved preset labels, dates, AML records and session credentials are not forwarded to public source services. Public address/transaction lookups reveal the requested reference to the source operator.

## Private research

`/api/porb/v1/blochai/research` lists or creates saved research settings; `/research/{id}` updates/deletes one saved preset. Presets are scoped to both authenticated user and organization, with at most 25 per user/organization. Read and write permissions are checked independently; a viewer cannot mutate research. Settings include network, public subject, mode, dates and private instructions. Saved settings remain until deleted or removed with their owning user/organization.

Submitting `{prompt, max_new_tokens, research?}` to `/api/porb/v1/blochai/tasks` retrieves bounded public observations on the server and combines them with the private prompt/instructions for the private GPU task. Research prompts are limited to 1500 characters, instructions to 1000; ordinary prompts retain the 4000-character limit. Outputs remain capped at 256 tokens. Date bounds filter only returned records with known timestamps, preserve undated records, and omit the graph. They do not request a historical scan or create historical balances. Network facts/balances retain their actual source observation time.

The saved source snapshot includes exact facts, coverage, source dates, up to 20 transaction records and a graph bounded to 40 references/80 edges. Reads require the same user and organization and a live 24-hour expiry. Expired rows are denied and cleaned opportunistically on new research submissions. This expiry concerns the D1 research snapshot, not the coordinator's durable task ledger. Prompts/results in that protected ledger have their own existing retention limitations.

Ethereum address research supplies a source-reported balance without native ETH transaction history. Bitcoin and Bloch address activity is bounded; a script/address is not a person or proven wallet owner. Source failures stay explicit. The model cannot manufacture missing coverage, verified finality or AML conclusions. Public fact retrieval does not give the public assistants access to private research or AML content.

PDF export runs locally after revalidating the user's organization session. It includes the displayed result, available source context, facts, transaction table and vector graph, with `CONFIDENTIAL` classification and organization context. PDF code/fonts are same-origin static assets; report content is never submitted to a PDF service. Logout, organization changes and Clear remove the local result/export state and invalidate pending export work. User-selected downloads are local files; they are not published to the public portals.

## Configuration and migration

Required server-only settings:

- `BLOCHAI_API_URL`: HTTPS origin for the private coordinator API.
- `BLOCHAI_API_TOKEN`: at least 32 characters; matches `BLOCKAI_PORTAL_TOKEN` and differs from public/worker credentials.
- `PORB_AUTH_PEPPER`: at least 32 random characters for rate-limit bucket hashing. It may differ from the portal's password pepper; existing session checks use the shared database and SHA-256 session hash.
- `PORB_DB`: existing portal D1 binding already declared in this configuration.

Apply only `deploy/blochai/migrations/0901_blochai_research.sql` to the existing portal database. It adds `blochai_research_presets` and `blochai_research_snapshots` with tenant/user ownership and expiry indexes. It does not recreate the portal or apply the public assistant's migrations. The public assistant has a different D1 database and credential.

```sh
wrangler d1 migrations apply PORB_DB --remote --config deploy/blochai/wrangler.toml
node scripts/build_blochai_assets.mjs
```

The build copies only `index.html`, `blochai.css`, `blochai.js` and the explicit shared PDF modules/font/license allowlist into `.data/blochai-assets/blochai/`. The PDF path is `/blochai/pdf/` under the existing page route; it does not require intercepting other portal paths. Shared dependency provenance and notices are in `site/blochai-shared/README.md` and its vendor manifest. Preserve pdf-lib/fontkit MIT notices and DejaVu font notices during upgrades.

The route list covers `/blochai`, `/blochai/*`, exact `/api/porb/v1/blochai/status`, `/tasks`, `/tasks/*`, `/research` and `/research/*`. Handlers validate each supported path/method. Existing `/agents`, `/memory`, `/runs` and other portal routes remain owned by the prior deployment.

## Authorization and operating limits

The gateway accepts browser sessions only and checks organization membership on every request. It injects the tenant identifier, enforces same-origin action headers for mutations, rejects browser tenant/source overrides, and bounds bodies, outputs and upstream timeouts. Inference content and research instructions are not stored in the audit log; audit records contain action/resource identifiers. Upstream independently enforces its private service token, wallet and tenant isolation. The public Worker has neither this token nor `PORB_DB`.

Private submissions allow 10/minute and 300/day per organization at the edge; preset mutations allow 30/minute per user/organization. Coordinator queue, wallet and context limits also apply. An unavailable inference backend returns an explicit unavailable state with unknown worker counts. The configured target is 13 NVIDIA A16-2Q workers, 2 GB VRAM and approximately 8 GB system RAM each; these values do not assert current connectivity.

Private workloads use only the trusted fleet. External GPU participation and BLCH rewards remain future features. They must not expose private AML workloads or credentials to public contributors.

## Validation

Run the private gateway/research contract tests and `node scripts/test_blochai_browser.mjs` with an installed Playwright runtime (`PLAYWRIGHT_MODULE` can select it). Verify tenant/user isolation, viewer denial, cross-origin rejection, saved preset lifecycle, source failures, date-filter coverage, session changes and local PDF export. Browser fixtures use synthetic model/source responses; production GPU inference and authenticated source retrieval require separate release verification.
