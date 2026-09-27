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

For USDT/USDC, the ledger's token activity and the graph now consume the same
validated activity capture within one research request. Its events, retrieval time
and window anchor are preserved in both views. Balance remains a separate source
observation. A successful current-window token query uses seven RPC calls instead
of eleven: three for balance and four for activity. A failed activity capture is
shared too, with no automatic second attempt. Captures are never cached across
requests, assets, addresses or users. Usable balance or graph evidence still
survives an independently failed module.

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

Each asset tab offers **Update ETH/USDT/USDC**, or **Retry** when its report could
not be collected. A manual update makes one existing bounded research request for
that exact asset and reference, under the same rate and authorization limits.
Only one update may run at a time; tabs, filters and downloads remain usable.
Success replaces the asset's entire report, including any newly unavailable
modules, and reassembles the bundle with a new assembly time and digest. Other
asset reports retain their exact content, timestamps, hashes and inspection state.
Old evidence is never stitched into a newer partial capture.

A failed, rate-limited, mismatched or corrupt update leaves the entire current
bundle and filters unchanged. The status identifies the failure and the retained
capture's original date; the download does not claim that an update succeeded.
**Download previous bundle** preserves the complete bundle immediately before the
last successful update, in browser memory until the next successful update or new
search. Both versions verify using the existing bundle format. This is a local
download convenience, not a retained history or synchronized snapshot.
New queries, network changes and logout/organization changes invalidate
pending updates. Public asset updates never reload private retained-result pages.

**Compare ETH/USDT/USDC captures** appears when the last successful asset update
has two available, distinct reports. It verifies both child hashes and their exact
network/asset/reference scope, then calculates locally without source requests.
The comparison lists all five modules' previous/current availability and the exact
signed balance difference in base units when both balances have compatible units.
Usable graphs are matched by original event ID; records found only before, only
after, changed material fields and unchanged counts remain separate. New observation
IDs or retrieval timestamps alone do not count as changed events. Transaction,
direction, event type, exact amount, block position and finality remain explicit.
UTXO input/output events are never flattened into address-to-address flows.

The inspector shows twenty compared records per page. **Download comparison JSON**
contains every compared record, source observations, both capture times/coverage and
original report hashes. `bloch-address-capture-comparison/1` uses `comparison_sha256`
over UTF-8 `JSON.stringify(comparison without comparison_sha256)`, preserving returned
property and array order. Input reports have the existing 2,800,100-byte limit;
the compact comparison is limited to 8,500,000 bytes and fails without truncation.
Missing modules stay unavailable rather than becoming empty graphs or zero balances.
Different capture windows may explain record presence; the comparison does not
claim complete activity, a reorganization, traced funds, transferred volume or
comparable ML group numbers. A newer successful update clears the prior comparison;
a failed update keeps it with its original captures. New searches and private
session/organization changes clear this local state through the existing viewer.

Every available report, including single BTC/ETH/USDT/USDC/BLCH results, also offers
**Compare with a saved capture**. Choose an earlier complete research JSON or an
ETH/USDT/USDC bundle previously downloaded from the product. Bundle imports verify
the entire bundle and every available child, then select only the matching asset.
Network, reference and asset must match the displayed report. The baseline needs
a valid UTC retrieval time no later than the current capture and a distinct report
hash. Identical, newer, unavailable, mismatched and corrupt inputs are rejected.

Files remain browser-local: no upload, source query, model refit or browser storage.
The 32 MiB file limit allows pretty-printed JSON; existing compact limits still
apply to individual reports, bundles and comparisons. Imported comparisons use the
same `bloch-address-capture-comparison/1` format with optional
`before.imported_from: {version, sha256}` identifying the verified report or bundle
container. The new metadata and explicit local-file authenticity limitation are
included in `comparison_sha256`. A checksum is not a trusted signature. File names
are displayed as literal text and are not included in the comparison export.

Imports preserve the current report, evidence filters and original downloads.
Rejected replacement files clear the imported comparison; **Clear saved capture**
also invalidates a pending file read. New searches, asset report replacement and
logout/organization changes discard the affected local import. Updating one asset
keeps the other assets' imported comparisons because their reports are unchanged.
Late file reads cannot restore cleared or superseded results.

Single-asset BTC/ETH/USDT/USDC/BLCH reports also provide **Update [asset]**, with one
bounded request for the displayed network, asset and reference. Editing search
fields does not change that scope until another search is submitted. Updates are
manual and serialized; the current report and its downloads stay usable while a
request runs. Source errors, rate limits, scope or integrity mismatches and render
failures preserve the current capture, its filters, saved-file comparison and any
previous capture. Failure notices identify the retained capture time.

A successful changed report replaces the entire capture. Old graph/ML results are
not carried into partial responses. Space's supplemental ledger, activity pages and
raw JSON are prepared and replaced with the same report; unavailable ledger data
removes the old details. Evidence filters and imported comparisons reset for the
new capture. Identical report hashes preserve the existing views and previous
capture instead of creating a duplicate update.

**Download previous capture** retains the complete preceding report and its original
hash until another changed successful update or a new search. **Compare captures**
uses the existing local comparison contract and makes no source request. Failed
updates preserve this comparison; a changed successful update clears it. Private
retained organization observations and pagination remain independent. New searches,
network changes and logout discard local capture history and invalidate late
updates through the existing viewer lifecycle. No new endpoint or persistent
history is introduced. Single and combined viewers dispose each replaced report's
import controls, including pending file reads, instead of retaining discarded
report elements through the parent search signal.

The private view separately searches the organization's retained ETH, USDT and
USDC observations. Each asset has its own result section, index coverage, error
state and pagination cursor. **More observations** advances only assets with an
outstanding cursor, without collecting public sources again. Existing tenant and
score-read authorization applies to every retained request; the public bundle
remains independently usable when a retained asset query fails.

### Reopen saved address research

**Open saved address research** is available beside address search in Space, the
public directory and the private reference view. It needs no live report: open a
complete BTC, ETH, USDT, USDC or BLCH research JSON, or a three-asset Ethereum
bundle. The saved view retains the original scope, times, module availability,
exact balances, graph evidence, stored ML results and report/bundle hashes. It
supports the same evidence filters, exact CSV and full JSON downloads. Open the
newer file first and use **Compare with a saved capture** to compare an earlier
file locally. Model fitting and source collection do not run when opening a file.

The reader checks the 32 MiB file limit, compact report/bundle limits, original
digests, canonical scope, real UTC dates, module structure, graph provenance and
bounded analytics/model arrays. Every available bundle child must pass before any
tab is displayed. Unavailable entries stay explicit, including bundles with zero
available reports. Checksums and structural checks do not authenticate the file,
prove its findings or establish current chain state; the view labels this boundary.
Module links start separate live research only when followed.

A replacement file is verified and prepared before replacing the current view.
Invalid files leave the previous report, filters and imported comparison intact.
New file selections and **Close saved research** invalidate pending reads. Live
queries and network switches leave this separately labeled local view unchanged;
logout clears it and cancels pending reads in the private reference view. Nothing
is uploaded or placed in browser storage. Files remain only in the loaded page's
memory. Loading this page and its modules initially still requires a connection;
this feature does not add an offline startup cache. Browser verification separately
exercises resident-byte parsing in offline mode and the native file picker with
all HTTP blocked, since WebKit's global offline emulation can deny `File.text()`.

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
