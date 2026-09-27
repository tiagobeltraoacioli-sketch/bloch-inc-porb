# Unified intelligence and partner API v1.2

Canonical portal: **https://rednblue.space/portal/**. The user confirmed this
spelling on 2026-09-25. Other spellings mentioned during planning are not deployment
targets. Existing accounts, organizations, passwords and sessions remain in the
same D1 database; no owner bootstrap or credential rotation is part of this release.

## Implemented workflows

- **Graphus modules** mounts System Map, Constellation, Oculum, Analytics, the
  research app, field catalog and DaaS under the same portal host and browser session.
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
- **Partner documentation** at `/developers/` describes 73 implemented operations,
  scopes, limits, pagination, errors, provenance and examples. `/developers/openapi.json`
  is OpenAPI 3.1, generated reproducibly from `scripts/build_partner_docs.mjs`.
  Documentation is public and contains no keys, private scores or customer evidence.

## Public data and central private access

`https://rednblue.space/explore/` provides anonymous address research and a directory of ten existing public
tools. Graphus keeps its seven public modules; Bloch Space keeps the complete
multichain workspace, Graph Lab and record explorer. The directory also links
science, ML, forecast evaluation, validators, network comparisons and the existing
Bloch L1 explorer. A single catalog drives public cards and private module tabs.
Public chain facts and descriptive analytics carry their existing source and
coverage limitations; publication does not establish ownership, identity or risk.

The private portal mounts the full Space workspace and nine source pages, including
legacy network/analytics views, under `/space/`. Navigation, workers, record links,
raw response links and exports remain on the portal origin. The fixed read-only
`/api/porb/v1/space/*` gateway exposes eleven allowed public adapters with `data:read`.
It cannot proxy Space account APIs, scores, writes or arbitrary URLs. Credentials,
organization IDs and private annotations are never forwarded to source sites.
Mounted pages share the portal session; the public originals remain anonymous.
PWA installation and offline caching are omitted from the private mount.

Actual organization scores, investigations, watchlists and governance records keep
their existing role/scope checks and non-cacheable responses. The old synthetic
score preview is retained only at `/aml/`; both its HTML and every fixture/code
asset require a current portal browser session. API keys and Space sessions do not
unlock these browser assets. The static root/index and public directory contain no
score values. Legacy `/assets/demo.json` redirects to the protected fixture; the
`aml-blochinc` build now contains redirects only. Space `/api/porb/*` returns 410
with the canonical portal link, even for a logged-in Space user or unconfigured
account database. Space preferences, recovery and account deletion remain intact.

Mounted tabs clear on logout/organization-change broadcasts and recheck their
session on visibility/pageshow and every 30 seconds. Source pages remain private
and non-cacheable even on redirect. Same-origin workers and local Blob exports are
allowed; script origins remain self-only. Reports retain independent checksums,
source scope, retention and review declarations; this architecture does not itself
establish a lawful basis for a customer's processing or GDPR/LGPD compliance.

## Unified address research

An address query now returns module results directly in the Bloch Space explorer,
the public `/explore/` page at rednblue.space and the authenticated Address research
view. The private view additionally searches the organization’s retained analyses;
those scores and links remain subject to their original scopes and tenant checks.

`GET https://bloch.space/api/research?network=ethereum&asset=USDT&query=<address>`
combines the existing Graphus wallet adapter, a typed Graph Lab address page,
reference incident counts and exact typed amounts, neighborhood topology, and
Space’s descriptive k-means. Assets are BTC, ETH, BLCH, USDT and USDC. Each response
carries module availability, independent source observations/anchors, model version,
features, cohort membership and coverage. The `bloch-address-research/1` report’s
`report_sha256` hashes `JSON.stringify(report without report_sha256)` in returned
property order. The complete verified report can be downloaded from every UI.

K-means uses degree, incoming/outgoing event counts and core membership for at least
nine comparable address/script references; transaction nodes and amounts are not
model inputs. Features are standardized with deterministic initialization. Labels
are unordered sample groups, never risk classes, owner identities or predictions.
Per-reference PageRank/Red/Blue values are absent from the public research report.
UTXO inputs/outputs stay separate; incident amounts are not summed into an invented
transfer volume. Block observations do not fill unobserved intervals with zeroes.
Native ETH address history requires an unavailable index; balance/nonce can still
be shown. Sparse address evidence does not qualify for time-series forecasts.

Failures remain per module when another source is usable; wholly failed requests
return 502. Complete reports above 2.8 MB return 422 rather than losing evidence.
Public reads retain Space’s 30 requests/minute/visitor and 300/minute/isolate budget.
The anonymous rednblue `/api/research` proxy has the same best-effort isolate limits,
accepts only a validated network/asset/reference and a fixed Space endpoint, and
forwards no cookies, tokens, organization IDs or private headers. It verifies report
integrity/scope and never follows redirects. Public responses are non-cacheable.
The authenticated `/api/porb/v1/space/research` route uses `data:read` and the existing
shared module budget. Public and retained results never merge their snapshots.

New searches clear prior output; superseded replies cannot replace the latest
query. Logout/organization changes invalidate pending private research results.

### Ethereum address query across assets

Choose **Ethereum: ETH + USDT + USDC** in public or private address research, or
**ETH + USDT + USDC** in the [Space explorer](https://bloch.space/?network=ethereum), to query one Ethereum reference across
the three supported assets. The URL selection is `asset=ETH_ALL`; this is a browser
selection, not a new chain asset or server API parameter. Three existing bounded
requests run concurrently, each with its actual asset, network and normalized
reference. Existing per-asset rate budgets still apply: one combined lookup uses
three research requests. No new endpoint, model, account permission or persistence
behavior is introduced.

Asset tabs expose ledger, graph and ML availability independently. They preserve
their own evidence filters and inspections without additional collection. Balances
retain their asset and exact units; graphs, source timestamps, block anchors and
ML cohorts are never merged. Native ETH history remains unsupported while ETH
balance can still be usable. A failed token source does not hide the other reports,
and failed or missing evidence is not interpreted as a zero balance or no activity.
Arrow keys and Home/End operate the tab list. Public links and Space history/reload
preserve the combined selection; network changes and new queries cancel stale
public work. The authenticated workspace also clears pending/visible results when
the session or organization changes.

**Download all three asset reports** exports `bloch-address-research-bundle/1`.
It contains the ordered ETH/USDT/USDC results, each complete child report and its
original `report_sha256`, or an explicit unavailable result with a bounded error
code. `bundle_sha256` hashes UTF-8 `JSON.stringify(bundle without bundle_sha256)`
in returned property order. A checksum binds supplied bytes; it does not attest
source identity or make these independently captured observations simultaneous.
The collector validates each child hash and exact scope, limits each compact child
to 2,800,100 bytes and the compact bundle to 8,500,000 bytes, and never truncates
evidence. Single-asset report downloads retain their existing format. Neither
bundle downloads nor public asset tabs contain organization scores or records.

The private view separately searches the organization's retained ETH, USDT and
USDC observations. Each asset has its own result section, index coverage, error
state and pagination cursor. **More observations** advances only assets with an
outstanding cursor, without collecting public sources again. Existing tenant and
score-read authorization applies to every retained request; the public bundle
remains independently usable when a retained asset query fails.

### Address evidence inspection

Every available address graph now has an interactive evidence viewer in the three
research interfaces. Focus any captured address, script or transaction, inspect
directed connections and open the original events with their exact base units,
transaction/block positions, finality and complete source observations/anchors.
Circles identify addresses, diamonds scripts and squares transactions. UTXO input
and output events remain separate across transaction boundaries; self events count
once. Layout coordinates and block ordering do not infer owners, event times or
continuity of funds.

Local filters combine direction, event type, exact minimum amount, inclusive block
heights and event/transaction/reference text. Unknown heights are disclosed and
excluded only when a height bound is applied. Invalid filters clear the current
view and disable its export. Connections page eight at a time, events ten and
comparable references twenty. Diagram and reference controls support keyboard
selection; the diagram scrolls horizontally on small screens.

Descriptive ML group buttons filter the comparable-reference table. Selecting a
reference focuses its captured graph without changing the searched address,
collecting another source page or refitting the model. Group numbering remains
unordered and specific to the original cohort. Unsupported graph modules, sparse
ML cohorts and unavailable forecasts retain their explicit availability states.

Evidence CSV includes every matching event across pages, or all events in the
selected connection, with applied filters, exact quantities, complete source
observations and the original `report_sha256`. Values are quoted and protected
against spreadsheet formula interpretation. Exports above 16 MB fail explicitly
without truncation and can be narrowed with filters. The complete research JSON
is unchanged by inspection. `bloch-address-evidence/1` identifies the local view;
it introduces no new server report, endpoint, score or persistence behavior.

## Authorization and capacity

New scopes are `cases:read`, `cases:write`, `watchlists:read`, `watchlists:write`.
Old API keys gain no scopes automatically. Reading case evidence and observation
scores also requires `analyses:read` and `scores:read`. Session viewers cannot
mutate cases or watchlists. Every query binds the organization obtained from the
session/key. Foreign IDs return 404. Browser writes retain origin/action checks.
All private responses are non-cacheable, carry `X-Request-Id` and API version 1.2.

Capacity per organization: latest 50 analyses; 100 cases; 50 snapshots per case;
100 watched references; latest 500 observations. Existing collection limits remain
6/minute and 100/day, with 1–8 pages / 1,200 references / 4,000 records. The Graphus and Space gateways share a 60/minute budget. Authentication remains 120 requests/minute
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

`site/graphus/` and `site/space/` are generated and ignored. The builder copies only selected public
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
contains scores, fixtures, the private database or gateway. All legacy preview paths redirect to the authenticated rednblue.space portal.

Rollback may redeploy the preceding portal build while leaving the additive tables
in place; do not drop evidence tables as a rollback step. The new workflow tables
are tenant-private and must be included in operator backup/retention procedures.

## Verification boundary

Unit and browser tests use isolated, explicitly synthetic source fixtures. Live
checks use public source facts through the deployed private gateway. They must
report actual source failures, never substitute fixtures. Keep all production
credentials and credential handoff files outside Git and public assets.
