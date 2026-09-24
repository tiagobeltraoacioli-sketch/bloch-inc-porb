# BI-PoRB private data portal

The user requested an invitation-only portal for Bitcoin, Ethereum and Bloch, with real observations, machine learning, organization APIs and scores without judgments. The separate Cloudflare Pages project is `rednblue-space`; its custom domain is `rednblue.space`. Its isolated D1 database is `bi-porb-portal`. Space and Graphus account databases are not shared.

## Delivered surface

- Private email/password sessions, invitations bound to email and organization, owner/admin/analyst/viewer roles, organization switching, password changes and one-time recovery codes.
- Owners create organizations for research, exchanges, banks, government and other market participants. Sector is descriptive metadata, not a permission grant.
- Owners/admins generate API keys, show secrets once, choose scopes and a 1–90 day expiry, and revoke access immediately. Inviting an administrator requires an owner. Sensitive administration requires password reauthentication.
- Graphus supplies BTC, ETH, BLCH and Ethereum USDT/USDC connection records. Space supplies network overviews and time series. Upstream origins are fixed in `portal/data.js`.
- A collection reads 1–4 source pages, up to 1,200 references and 4,000 records. Capacity stops preserve completed pages with an explicit reason. Source errors and conflicting events fail closed; repeated events are deduplicated and conflicting block hashes rejected.
- The latest 50 analyses per organization preserve exact source amounts, model version, dataset SHA-256, observation times, block anchors and individual wallet/script results. Ordered database parts keep each value below D1's size limit; deletion cascades to those parts.
- Collection is on request, not an exhaustive background index. Space and Graphus windows are generated separately; their heads, graph samples and telemetry are not one atomic cross-network snapshot.

## Model contract

`porb-observation-1.0.0` returns two independent descriptive indices on a 0–100 scale, without identity labels or legal, AML, credit or ownership classifications.

**Red:** Isolation Forest isolation score × 100, fitted separately to each saved asset sample. Configuration: 64 trees, sample size up to 64, seed 20260924; at least 20 wallets/scripts and three distinct feature vectors. Ineligible cohorts return `red: null`. Shorter average isolation paths give higher indices. Results are sample-relative and are not calibrated across networks or collection windows.

Features: log incoming/outgoing event counts, log adjacent-reference count, log10(1 + incoming/outgoing base units), direction balance, adjacency concentration and log active block count. Source amounts remain exact integer strings. In UTXO networks, neighboring transaction references are not inferred counterparties. Incoming and outgoing records are never added into transfer-volume claims.

**Blue:** observed-record completeness, weighted 30% valid block hash/height, 25% transaction/event reference, 25% exact amount and 20% valid timestamp. It does not estimate complete-chain coverage or independent source correctness. Missing Bloch timestamps contribute zero to that component.

Displayed feature differences are standardized cohort differences, not causal explanations or forest feature attributions. Two disjoint 32-tree ensembles measure computational stability; their score spread is not predictive accuracy or a confidence interval. Standardized k-means supplies descriptive groups. Constant features produce no correlation or artificial standardized difference.

Time-series analysis reuses Space statistics, rolling estimates, autocorrelation, k-means and expanding-window AR(1) historical evaluation. Each prediction uses preceding observations only, compared with persistence at the same positions. Missing observations and changed Bloch telemetry coverage break the fitting segment.

References: [Isolation Forest, Liu, Ting and Zhou, ICDM 2008](https://cs.nju.edu.cn/zhouzh/zhouzh.files/publication/icdm08b.pdf), [Cloudflare D1 transactional batches](https://developers.cloudflare.com/d1/worker-api/d1-database/).

## Authentication and storage

Password hashing uses scrypt (`N=16384`, `r=8`, `p=5`, 64-byte output), a random salt and a separate server secret pepper. This is the 16 MiB profile in the [OWASP password storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt). The runtime uses [Workers Node crypto](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/).

Cookies are HttpOnly, Secure on HTTPS, SameSite=Strict, host-only and expire after 12 hours. Session, invitation, recovery and API tokens use 256 bits of randomness and only SHA-256 digests are persisted. Tokens are rejected in query parameters. Invitation tokens travel in a URL fragment, removed before requests; acceptance is conditional and transactional. Existing account holders must supply their existing password to join another organization.

Browser mutations require the exact same-origin `Origin` plus `X-Porb-Action: 1`. Bearer API access checks creator membership, administrator role, revocation, expiry and scopes on every request. Keys cannot manage accounts or other keys. Password change and recovery revoke all account sessions and API keys, issue a fresh session, and rotate the recovery code.

Private responses use `Cache-Control: no-store, private`; JSON bodies are limited to 8 KiB. Durable budgets limit authentication by hashed IP/email/time bucket, collection by organization and requests by user/key. Raw IP is not stored. Authentication cleans expired session/rate-limit entries. The owner maintenance endpoint can compact the organization's audit to its latest 2,000 entries. Audit records actions and resource IDs rather than secrets or source bodies.

| Endpoint | Method | Required key scopes |
| --- | --- | --- |
| `/api/porb/v1/overview` | GET | `data:read` |
| `/api/porb/v1/science?network=bitcoin` | GET | `data:read` |
| `/api/porb/v1/model` | GET | `scores:read` |
| `/api/porb/v1/analyses` | POST | `data:read`, `analyses:write`, `scores:read` |
| `/api/porb/v1/analyses` | GET | `analyses:read`, `scores:read` |
| `/api/porb/v1/analyses/{id}` | GET | `analyses:read`, `scores:read` |
| `/api/porb/v1/analyses/{id}/scores` | GET | `analyses:read`, `scores:read` |
| `/api/porb/v1/analyses/{id}/export` | GET | `analyses:read`, `scores:read` |

Collection body: `{"asset":"BTC","pages":2}`. The authenticated principal supplies organization scope. Another organization's analysis ID returns 404. Lists contain scores and therefore also require `scores:read`. Collection budget: 6/minute, 100/day per organization.

## Deployment

Backend, model and migrations: `portal/`. Browser: `site/portal/`. Pages route: `site/functions/`. `site/wrangler.toml` targets the new portal project. Deploy from **site/** so Pages discovers Functions. The root redirects to `/portal/`. Existing AML preview assets remain separate from authenticated data; these commands do not redeploy `aml-blochinc`.

```sh
cd site
wrangler d1 migrations apply bi-porb-portal --remote
wrangler pages deploy . --project-name rednblue-space --branch main
```

There is no public owner-bootstrap endpoint. The operator script requires an explicitly named owner:

```sh
python3 scripts/porb_portal_admin.py --email OWNER_EMAIL --domain rednblue.space --apply
```

It generates a password/recovery code, installs `PORB_AUTH_PEPPER`, and saves the local handoff under ignored `.data/porb-portal/` with mode 0600. Never commit, publish or log these files. It sends no email. Later invitations are created in the portal and shared by the administrator. The explicit password-hash migration flag is only for authorized initial runtime setup and must not reset an owner's later password.

```sh
node --test tests/test_porb_model.mjs tests/test_porb_portal.mjs tests/test_space_science.mjs
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/test_porb_browser.mjs
python3 scripts/porb_portal_live_check.py --collect
```

Browser tests use synthetic test fixtures in an isolated local database. Live checks use local owner credentials, save real analyses, verify a temporary scoped key and revoke it, without printing secrets. The live script accepts only configured portal origins. Custom-domain DNS activation is checked separately from application deployment.

## Release verification — 2026-09-24

18 model, authorization, isolation, recovery, concurrency and time-series tests passed. WebKit passed the complete local interface flow and the published owner's login, saved Ethereum analysis, HttpOnly session, administration controls, mobile layout and logout. Remote checks passed scoped-key creation/use/revocation and retrieval of persisted real datasets.

Latest verified source samples (not full-chain totals):

| Asset | Wallet/script references | Connection records | Source pages |
| --- | ---: | ---: | ---: |
| BTC | 100 | 111 | 2 |
| ETH | 89 | 48 | 2 |
| BLCH | 19 | 1,296 | 4 |
| USDT | 735 | 609 | 2 |
| USDC | 623 | 621 | 2 |

Bloch's 19-reference cohort does not meet the 20-reference Red threshold; Red remains null and Blue remains available. Space returned 30 Bitcoin block observations, 48 Ethereum fee/gas observations and 97 Bloch telemetry observations. Historical AR(1) evaluation was available for Bitcoin and Ethereum; Bloch lacked the required stable-coverage fitting segment. No missing model output was fabricated.

Source APIs can return transient 502 errors. Public reads use up to two attempts with a 20-second request deadline and bounded response bodies. Redirects use the Workers-supported manual mode and non-success responses are rejected. The application is available at `https://rednblue-space.pages.dev/portal/`. The custom domain was attached, but DNS creation returned HTTP 403 with the available Pages credential; activation requires the zone's proxied CNAME `rednblue.space` → `rednblue-space.pages.dev`.
