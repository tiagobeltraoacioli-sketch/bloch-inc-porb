# BlochAI web release — 2026-09-28

This document records the initial deployment. The later chain research,
personalization and export update is recorded in
[blochai-chain-research-release-20260928.md](blochai-chain-research-release-20260928.md).

BlochAI now has a public product hub at `https://blochai.xyz/` and authenticated
GPU inference at `https://rednblue.space/blochai/`. Public Graphus, Bloch Space
and Bloch Explorer entry pages offer a public guide restricted to each portal's
purpose and link to the hub. The canonical Graphus domain is
`bloch-graphus.xyz`.

## Preserve the existing portal

The current Pages publication was built from `f327bee69232342f1bb5dc9335bd9511ec96725d`,
which was not available in the local checkout or fetched repository branches.
This release therefore adds isolated Workers and assets. It does not republish
the older Pages checkout. The existing portal HTML was compared byte for byte
before and after deployment and remained unchanged.
The later final comparison excluded only the observed Cloudflare Insights
beacon injected by the provider; the original application HTML still matched.

The private Worker owns only `/blochai`, `/blochai/*`, and the exact inference
status/tasks route patterns in `deploy/blochai/wrangler.toml`. Existing BlochAI
agents, memory, runs and reports continue through the existing portal. Never
broaden this route list to `/api/porb/v1/blochai/*`.

## Public and private boundaries

The public Worker has a dedicated public database and public inference token.
It has no private portal database binding, session access or private inference
credential. Its public database stores bounded usage counters and hashed,
expiring polling tickets, never prompts or answers. The hub itself sets no
cookies and disables scripts, connections, forms and frames through CSP.
Inference/auth paths on the hub return 404.

Only the three public homepages and the Bloch Space `/app/` entry receive
a guide widget. Exact assistant asset and task API routes are also added on
those three hosts. Other application paths and APIs retain their routing. The
Explorer's existing CNAME destination was preserved and Cloudflare proxying was
enabled so its route can run; the previous record is retained in private
deployment evidence for rollback.

Public visitors select a predefined question: graph connections/readings on
Graphus, network observations/freshness on Bloch Space, or blocks/transactions/
eUTXO concepts on Bloch Explorer. Both the edge and backend enforce the closed
catalog. The host determines the portal; free text, tenant overrides and extra
fields are rejected. These responses explain portal concepts, not live records.
No private content is included in the model context, and no private memory or
retrieval source is connected. Outputs are rendered as text.

The gateway uses separate credentials, a persistent service wallet, budgets and
quotas for public work. Reads require the public wallet and matching portal;
edge reads also require an expiring random capability ticket. Public credentials
cannot read private status, jobs or the ledger. The 13 trusted internal workers
serve both classes of task without conversational state. External contributor
GPUs remain disabled and require a separate public workload boundary first.

The inference Worker accepts only HTTPS on `rednblue.space`, checks the existing
portal session and membership for every request, derives the tenant server-side,
and rejects foreign origins and browser-supplied tenant overrides. The backend
independently validates its private service credential and task ownership. No
inference content is written into the portal audit log. The coordinator retains
prompts and results in its protected private ledger; it has no automatic content
deletion policy yet. Public clients cannot query this ledger.

## Live inference

The release verified 13 registered, online and GPU-ready Edgevana workers.
Each host has an NVIDIA A16-2Q with 2 GiB VRAM and approximately 8 GiB system RAM.
The loaded model is `Qwen/Qwen2.5-0.5B-Instruct`; tasks use two replicas. GPU
memory is local to each worker, not a single pooled device.

The browser verification submitted the non-sensitive question “what is 2 + 2?”
through the production portal and received a completed real model response.
Desktop and 390/360 px layouts passed, foreign-origin reads returned 403, and
logout cleared the prompt and result. Runtime availability is shown from current
heartbeats, not inferred from configured fleet size.

Use `scripts/verify_blochai_live.mjs` with an external `PORB_CREDENTIALS` file
for a deliberate live check. It prints no credentials or private user content;
its test prompt is a fixed public arithmetic question. Local contract/browser
tests use explicitly synthetic fixtures.

The gateway uses manual redirects, an explicit service User-Agent and
`global_fetch_strictly_public` for its Cloudflare subrequest. It rejects redirects
instead of forwarding its service credential. Operational error logs contain
only status codes or bounded error categories, never prompts or tokens.

## Build, rollback and roadmap

### Final public verification

The JavaScript contract suite passed 32 tests. Real browser checks completed
one GPU question on each public portal, with zero page JavaScript errors and
no overflow at 1440, 390 and 360 pixels. Responses were specific to graph
connections, public network observations and explorer blocks respectively.
The production API also rejected extra prompt/portal fields, foreign origins,
missing tickets and tickets issued for a different portal. Evidence is retained
in `.data/blochai-live-browser/report.json` and the backend's private
`public-live-verification.json`.

An initial public deployment caused temporary HTTP 503/error 1019 on entry
pages because its strictly-public fetch flag routed same-zone passthrough back
into the Worker. The public Worker now explicitly uses
`global_fetch_private_origin`; page loads and real GPU flows passed after the
correction. The authenticated private Worker was unaffected. A regression
check protects this routing configuration.

Build the private and public assets with `scripts/build_blochai_assets.mjs` and
`scripts/build_blochai_public_assets.mjs`. Deploy their dedicated Wrangler files;
do not deploy `site/` as a replacement for the current portal. Server secrets
remain in Cloudflare and private operator files outside Git/public assets.

Rollback each Worker to its previous version, or remove only its exact routes.
Disable public link insertion with `ENABLE_PUBLIC_LINK=false`. Do not remove
portal tables or rotate existing account credentials as a rollback step.

“Connect your GPU. Earn BLCH.” is a planned contributor program, visibly marked
as inactive. This release adds no public GPU enrollment, wallet connection,
reward rate or BLCH payout. The backend's internal BAI prototype accounting is
not BLCH. External contributors must not receive tenant-private AML workloads;
that separation is an explicit gate in the backend GPU rewards roadmap.

The Space route uses `/app/*` to include its saved `network`/`view` query parameters on reload. The handler still inserts the widget only when pathname is exactly `/app/`; deeper app paths pass through unchanged. Other API and account routes are not covered by this route.

Final public Worker version: `0b63588b-7038-4e38-b8f4-7e1297f4cb39`. The Space query-string reload passed after this final routing adjustment. Private Worker version remains `3d71d1e6-0052-4e07-98fc-eba5b9ebd0ed`.
