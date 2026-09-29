# BlochAI derived chain readings

`deploy/blochai-public/chain-insights.js` computes deterministic readings from an already validated public snapshot. It makes no network request, queries no private store and does not infer identities, ownership, intent, risk, investment outcomes or complete chain coverage. These calculations are separate from model training and from the source observations themselves.

`deriveChainInsights(guide, {now})` returns up to four supplemental `facts` and eight `insights`. Each insight includes an ID, title, at most 600 characters of text, up to six existing source IDs, and `available`, `partial` or `unavailable` status. Pass the collection time as `now` so source ages remain reproducible in a saved snapshot. The function does not mutate or replace the original facts.

The public guide stores these as `derived_facts` and `insights`. `compactObservations` excludes them: the gateway receives the bounded source projection, not a second unreviewed layer of context. The private research service can call the same pure function after it retrieves public evidence, while preserving its user/organization access checks.

## Calculations

- **Exact coin notation:** unsigned decimal integer strings are converted with `BigInt`, using eight decimal places for BTC/BLCH and eighteen for ETH. Trailing zeroes may be omitted, without rounding. Both the base-unit value and explicit coin symbol appear. This is a notation conversion, not fiat pricing or another balance measurement.
- **Directed graph density:** distinct non-self ordered pairs divided by `n × (n − 1)`, rounded to six decimal places. Duplicate edge records and self-links remain counted separately. Density is undefined for fewer than two nodes, including a lone address observation.
- **Neighborhoods:** maximum distinct incoming/outgoing neighbor counts, isolated references and weakly connected components in the displayed graph. Repeated directed records and self-links do not inflate these degree counts. These statistics concern at most 40 nodes and 80 records, not the entire network.
- **Transaction sample:** distinct hashes, supported record counts and source-reported statuses, restricted to the selected asset and at most 20 records. Unsupported or excess rows are disclosed. Status categories do not establish independent validation or finality.
- **Bitcoin fee arithmetic:** input minus output is compared with both derived and reported fees only when complete input/output totals are present in sat. Missing or inconsistent totals do not produce a positive verification claim. Input and output totals are never added into transfer volume.
- **Ethereum execution fee:** gas used times effective gas price is checked exactly against the returned derived execution fee. Transaction value and blob fees remain separate. The source adapter is responsible for matching the receipt to the requested transaction and block.
- **Checkpoint distance:** observed head height minus reported finalized height is computed only for matching block-unit fields in an available network overview. Slot numbers, transaction inclusion heights and unrelated source checkpoints are not subtracted. Negative ordering produces a partial-evidence warning, not a reorganization verdict. Differing observation times remain explicit.
- **Source ages:** retrieval and underlying observation ages are displayed separately at the recorded comparison time. Missing, malformed or future timestamps never become claims of fresh data. A successful HTTP retrieval does not prove the chain observation is current.

Unavailable/partial sources remain visible. The source-summary answer prioritizes readings that match the selected topic: graph structure for graph questions, amount/fee arithmetic for balances and fees, and source ages/coverage for health questions. It continues to use exact supplied facts and reviewed notes; unchecked model drafts are not published.

## Interface and exports

Public topics are filtered by their catalog `networks` metadata in buttons, selectors and local text matching. Switching away from a topic's supported network clears the selection instead of silently substituting an unrelated topic. Public Explorer topics remain Bloch-only. The API independently validates these network constraints.

The widget shows "Computed readings" separately from source facts. JSON preserves the original facts, supplemental facts and source-linked insights in distinct fields. CSV uses separate `fact`, `derived_fact` and `insight` record types and retains source IDs. PDF can include all 48 source facts, four supplemental facts and eight labelled derived readings within its 60-row bound. Unit conversion never changes stored transaction amount strings or their sat/wei metadata.

The UI release version is `20260928-chain-3`; script and stylesheet use the same exact version query and retain revalidation/contrast safeguards from the prior release. Shared PDF generation remains local to the browser.

## Verification

`tests/test_blochai_chain_insights.mjs` checks exact integers beyond JavaScript Number precision, one-node/duplicate/self-loop graphs, complete versus partial fee evidence, reversed checkpoints, future/missing source times, asset isolation, bounded output and input immutability. The public browser fixture verifies network-specific topic filtering, preservation of derived readings in CSV/JSON/PDF, literal rendering and responsive contrast. Production source/model availability is verified separately from these deterministic tests.
