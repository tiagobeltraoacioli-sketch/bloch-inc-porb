# Public BlochAI hub and chain guide

`blochai.xyz` is a static product hub linking Graphus, Bloch Space and Bloch Explorer. The canonical Graphus hostname is `bloch-graphus.xyz`. Private prompts, saved personal research, organization data and AML workflows belong only in the authenticated `rednblue.space` workspace. Public assistants cannot access that workspace's database, sessions, private inference credential or records.

Each public portal offers chain-specific explanations with a bounded public source snapshot. Graphus covers graphs, connections, address observations and provenance; Space covers Bitcoin, Ethereum and Bloch network research; Explorer covers Bloch only. The public catalog has 11 Graphus, 13 Space and 11 Explorer topics. `knowledge.js` mirrors the backend's reviewed `chain_knowledge.json`; keep IDs, notes and references synchronized during a release.

## Interaction and data boundaries

The widget offers summary, explanation, checklist and hypothetical-example modes. A visitor can select a topic or type English/Portuguese words to find a topic locally. The interface shows the matched canonical question before submission. Ambiguous or unmatched text requests a topic selection. Raw typed topic text, arbitrary prompts, conversation history, current page contents and files are never sent to the public API. This is topic-guided interaction, not arbitrary chat.

A selected network can include an optional public address/script reference or transaction hash. Identifiers are checked before source access and sent only to the fixed public chain adapters. Source operators therefore receive the requested public reference. The API accepts no arbitrary URL, RPC endpoint, imported source body, private label or tenant override. Bitcoin, Ethereum and Bloch remain distinct networks; the Explorer accepts only Bloch.

The source adapters fetch only pinned HTTPS endpoints, reject redirects and unexpected schemas, and normalize fields with explicit bounds. Raw upstream objects, node addresses, private tags, identity fields and arbitrary source text do not enter the guide. Numeric base units remain exact decimal strings. Source failure produces an unavailable/partial source card, not invented zero values or synthetic fallback records.

Source coverage remains visible:

- Network overviews and recent graphs are source-reported samples with their own anchors and observation times, not a complete historical scan.
- Bitcoin address observations expose an aggregate and up to eight confirmed transactions. Neighbor observations may have different retrieval times.
- Ethereum address lookup provides one balance at a source-reported finalized block. The native ETH address endpoint does **not** provide transaction history.
- Bloch address lookup uses a public script hash. Its balance and up to 64 indexed events are separate observations, not owner attribution or full chain history.
- A transaction lookup describes one returned transaction and bounded input/output references. Execution, confirmation depth and finality are distinct observations. UTXO/eUTXO inputs and outputs are not added into a supposed transfer volume.

The browser renders up to 20 transaction records and a graph of at most 40 references and 80 observed connections. Graph layout is an illustration of the returned relationships, not proof of ownership, risk or continuity of value. The model receives a compact facts/context projection within its 2048-token context budget. Its public draft is not trusted for factual presentation: the edge assembles the displayed explanation from reviewed notes, exact source facts and coverage, with `answer_kind: "source_summary"`. The interface labels it "Source-based explanation". Unchecked model prose is withheld, including from public exports.

Up to 12 completed exchanges remain in tab memory. Follow-ups repeat the selected topic and public target with a new response mode; prior model output is not supplied as trusted evidence. Clear and page exit erase local history and abort polling. Clearing does not cancel an already accepted GPU task or delete its protected backend record.

## Downloads

Each result can download CSV or JSON containing the bounded public facts, source metadata and transaction observations; JSON also retains the graph, context and explanation. CSV neutralizes spreadsheet formula prefixes and preserves exact source amount strings in `amount_base_units`, with explicit `amount_unit`. JSON includes `amount_units` for BTC/sat, ETH/wei and BLCH/sat; a base-unit integer is never presented as a whole-coin amount. The conversation PDF includes questions, responses, source dates/coverage, exact facts, bounded transaction tables and vector graphs. Exports identify their source coverage and do not certify records or assign identity/risk.

PDF bytes are created on the visitor's device using self-hosted modules and a bundled font. No report content is sent to a PDF service or CDN. Public exports are labelled `PUBLIC`. The shared assets and notices are documented in `site/blochai-shared/README.md`; pdf-lib and fontkit use MIT licenses, and DejaVu's notices ship with the unmodified font. `vendor-manifest.json` records asset hashes. Keep notices when copying or updating dependencies.

## API, credentials and retention

The public Worker has a dedicated `BLOCHAI_PUBLIC_DB` binding. It has no private database, session, organization or audit bindings. `PUBLIC_BLOCHAI_API_TOKEN` and `PUBLIC_BLOCHAI_IP_HASH_KEY` are server-only secrets installed outside Git. The inference secret authorizes only the coordinator's `/public/v1/tasks` API. Its origin is pinned to `https://blochai-origin.posternlabs.com`; redirects are refused, and browser cookies/authorization never reach it.

`POST /api/blochai/tasks` accepts `{question_id, mode?, network?, subject?}`. Defaults are `mode: "explain"` and `network: "bloch"`; a subject is `{kind: "address"|"transaction", value}`. The portal comes from the hostname. Extra fields and query parameters are rejected. Same-origin checks and `X-BlochAI-Client: public-v1` apply. Browser-supplied source objects and raw prompts are forbidden; the server retrieves and normalizes public observations itself.

Submit limits are 10/minute and 60/day per daily HMAC-hashed client IP shared across the three public portals, plus a configured global 600/day. Raw IP addresses are not stored in D1. Polls have a 90/minute per-address budget and require a random capability held in tab memory. D1 stores only its hash, portal, task ID, a full bounded public guide snapshot, and a one-hour expiry. Reads deny expired snapshots; expired records are cleaned opportunistically on subsequent submissions. This expiry applies to the edge snapshot/capability, not the coordinator's durable task ledger.

The submit and poll response include the same saved `guide`: topic, mode, network, curated reference notes, facts, sources, timestamps, coverage, transaction records and graph. They exclude tenant, private prompt, worker and accounting metadata. All dynamic text is rendered as text, never executable HTML. The coordinator uses a separate public wallet and reserved `public:<portal>` ownership; public credentials cannot read private jobs.

Apply both migrations to the **separate public database** before deploying:

```sh
wrangler d1 migrations apply BLOCHAI_PUBLIC_DB --remote --config deploy/blochai-public/wrangler.toml
node scripts/build_blochai_public_assets.mjs
```

`0001_public_assistant.sql` creates quotas/capabilities; `0002_public_chain_snapshot.sql` adds `guide_json`. Build output is an explicit asset allowlist under `.data/blochai-public-assets/`, including `/blochai-pdf/` modules, font and notices. No private data or source credentials belong in that directory.

## Routing and static hub

The static hub strips incoming authentication headers, sets no cookies, and blocks scripts, connections, forms and framing with CSP. It cannot serve the assistant/PDF JavaScript or accept inference requests. Hardware figures are configuration targets, not live uptime.

The HTML handler inserts only the fixed widget and stylesheet on the three HTTPS root paths and Space's exact `/app/` pathname. The Space `/app/*` route covers query-string reloads; deeper paths pass through unchanged. The widget is outside application navigation and uses no inline scripts or styles. Origin content/security headers are preserved.

Additional routes cover the two widget assets, `/blochai-pdf/*`, `/api/blochai/tasks` and `/api/blochai/tasks/*` on the three public hosts. Widget asset route patterns end in `*` only to cover release-version queries: handlers still accept exactly `/blochai-assistant.js` or `.css`, with no query or the exact current `?v=<ASSISTANT_ASSET_VERSION>`. Other suffixes, parameters, duplicate versions and PDF query strings are rejected. Script and stylesheet use the same release version and require cache revalidation to prevent a new interface loading stale styles. The widget explicitly keeps a light palette and readable control states inside dark portal themes. PDF paths are restricted to the built shared asset allowlist; task reads accept only a lowercase 64-character hexadecimal ID. Unrelated APIs and account paths keep their existing routing. There is no public `/research` endpoint; saved personal research is private to Rednblue.

Use `ENABLE_PUBLIC_ASSISTANT=false` to disable inference and show a product link; use `ENABLE_PUBLIC_LINK=false` to disable HTML insertion. Do not deploy the standalone links configuration alongside this Worker. The public Worker uses `global_fetch_private_origin` so same-zone HTML passthrough reaches the Pages origin. `global_fetch_strictly_public` would recursively call this Worker. The separate private Worker has no such passthrough and retains its own flag.

The GPU contributor program remains a roadmap item. This release has no external GPU enrollment, wallet connection, BLCH reward calculation, payout or on-chain operation.

## Validation

Run `node --test tests/test_blochai_public.mjs tests/test_blochai_public_assistant.mjs tests/test_blochai_chain_data.mjs` plus `node scripts/test_blochai_rewriter.mjs` and `node scripts/check_blochai_assistant_fixture.mjs`. The browser fixture checks three portals at 1440, 390 and 360 pixels, local topic routing, scoped identifiers, follow-ups, source/graph literal rendering, clear/abort behavior, CSV/JSON downloads and a real PDF download. `PLAYWRIGHT_MODULE` and `MINIFLARE_MODULE` can select installed local runtimes. Production validation is separate; fixture success is not a live-data or GPU availability claim.
