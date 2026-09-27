# Bloch Space intelligence release

Bloch Space now opens the three-network workspace at `/app/`. The query-string
record explorer is preserved at `/?network=bloch` (and the other networks).
Existing block, transaction, address, validator, fee, mining, analytics, and
comparison pages continue using their bounded source adapters.

The subsequent [Graph Lab release](bloch-space-graph-lab.md) adds `/graph/`:
progressive public-evidence expansion, ordered paths, nine graph-analysis panels,
source-preserving imports/exports and a macOS 1.1 Command-5 shortcut.

## Research workspace

Data Science and Machine Learning consume the same validated `/api/series`
responses as the existing analytics pages. Default research windows are 30
Bitcoin blocks, 48 Ethereum blocks, and 24 hours of Bloch monitored connections.
The range picker retains all supported source windows. The feature picker
recalculates descriptive results without issuing another upstream request.

The panels cover observed series, preceding-window means, empirical histograms,
rolling dispersion, prior-window z-scores, Pearson correlation, standardized
k-means groups, lag autocorrelation, chronological AR(1) evaluation, and residuals.
CSV exposes the displayed table; research JSON includes the model version,
derived results, provenance and complete original source response. Exact source
integer strings remain intact; derived calculations use floating point.

AR(1) is fitted separately before every evaluation step, using only prior
observations. The final quarter of the latest uninterrupted segment is evaluated
against persistence at the same positions. At least 24 consecutive observations
are required. Bloch missing samples and changes in reporting-node coverage reset
the segment. A constant feature has no correlation or skill ratio when the
relevant denominator is zero. The model can perform worse than persistence.
K-means describes the current sample; it is not an out-of-sample prediction,
identity classifier or AML model. Statistical deviations are not risk labels.

`GET /api/graphus?network=bitcoin|ethereum|bloch` reads the public Graphus manifest
and, for Bloch, its bounded indexed holder ranking. Only fixed HTTPS upstreams
are accepted. Requests time out, response sizes are bounded, and ranking schema,
unique script references, order, positive balances and indexed total are checked.
The displayed concentration denominator is the full indexed balance, not the
returned top sample. Bitcoin and Ethereum global holder rankings remain
unavailable. The canonical live Graphus domain is `bloch-graphus.xyz`.

## Account workspace

`/account/` supports registration, sign-in, logout, a private saved view,
recovery-code password reset, and password-confirmed account deletion.

- Cloudflare D1 binding: `SPACE_DB`; migrations: `space/migrations/`.
- Required secret: `SPACE_AUTH_PEPPER`, generated randomly and stored only in
  the Pages project's secret store. Never put it in a tracked configuration.
- Passwords: 14–128 characters; salted PBKDF2-HMAC-SHA-512, 100,000 iterations,
  with a separate server-side pepper. Passwords and recovery codes are never
  stored in plaintext.
- Sessions: random 256-bit tokens, SHA-256 digests in D1, 24-hour expiry;
  `__Host-space_session`, Secure, HttpOnly, SameSite=Strict, Path=/ in production.
- Registration/sign-in/recovery: atomic D1 hourly budgets, 20 attempts per IP.
  Budget keys are peppered hashes of IP and hour, not stored raw IPs.
- Mutations require an exact Origin and `X-Space-Action: 1`. Bodies are limited
  to 8 KiB. SQL queries are parameterized; user IDs come from server sessions.
- Recovery rotates the one-time code and revokes all prior sessions. Account
  deletion removes sessions, preferences and the account. No email delivery or
  verified-email claim is implemented. Losing both password and recovery code
  requires operator assistance; there is no email reset flow.
- API responses are private/no-store, including failures. No account response
  enters the service-worker cache. A saved workspace is scoped to one account.

`GET /api/account/config` and `/api/account/session` report availability/session.
`POST /api/account/register`, `/login`, `/recover`, `/logout` implement access.
`GET|POST /api/account/workspace` reads/writes one private network/view/range.
`DELETE /api/account/delete` requires the current password.

`/api/porb/*`, including the old preview and score routes, now returns 410 with
`https://rednblue.space/portal/`. No score values are served by Space, even with a
Space session. The synthetic preview is retained behind the central portal's
browser authentication. Existing Space account preferences, recovery and deletion
remain available; a Space account does not grant private intelligence access.
Public chain observations and descriptive research remain open. No chain consensus,
transaction acceptance or on-chain labels are modified.

## PWA

The manifest provides a standalone application, 192/512 pixel icons and research
shortcuts. `sw.js` precaches only the public application shell and code. Offline
navigation opens that shell, labels the connection state, and refuses API reads
with a 503 JSON response. No live-data availability is implied while offline.
Initial service-worker activation preserves the current page and in-flight address
queries. Replacing an existing controller after an accepted update reloads once.
Updates are offered with an explicit reload action. The current shell cache is v5. Bump the cache version when
shipping changed precached assets. Cache contents are restricted to the app's
own cache-name prefix; APIs, POSTs and third-party requests are not persisted.

## Desktop

`desktop/BlochSpace` is the native macOS 12+ WKWebView client. It shares the HTTPS
application and server-side account checks, provides native menus, navigation,
network shortcuts, a browser action, persistent WebKit sessions, and user-selected
export destinations. It exposes no native scripting bridge. External navigation
is restricted to listed HTTPS sources; exports use WKDownload and NSSavePanel.
A bundled offline screen offers reconnect. Live data still requires connectivity.

Run `sh desktop/build.sh` on macOS with Xcode Command Line Tools. It generates
code-drawn icons, builds Intel and Apple Silicon executables, combines them into
one universal app, signs ad hoc, and produces a ZIP and SHA-256 digest in
`desktop/dist/`. The public download is in `space/public/downloads/`.
This development distribution is not Apple-notarized. Apple Developer signing
and notarization require the product owner's signing credentials and are not
claimed by this build. Windows and Linux binaries are not included.

## Validation and publishing

```sh
node --test tests/test_space_explorer.mjs tests/test_space_science.mjs tests/test_space_accounts.mjs tests/test_space_graphus.mjs
cd space
wrangler d1 migrations apply SPACE_DB --local
wrangler pages dev public --binding SPACE_AUTH_PEPPER=local-test-only-pepper
```

Use a supported Node version with `node:sqlite` for the account contract tests.
The browser smoke script accepts `SPACE_TEST_URL`, `SPACE_PLAYWRIGHT_MODULE`, and
`SPACE_CHROME_PATH`. Its default target is localhost; it tests temporary account
creation/deletion, source-backed charts, mobile overflow and PWA offline behavior.

For production, apply D1 migrations remotely, set the pepper once, and deploy
`space/public` with its sibling Pages functions using `space/wrangler.toml`.
Do not rotate the pepper casually: existing password verification depends on it.
No client bundle contains the pepper or a database credential.

Implementation references: [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/),
[Workers Web Crypto](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/),
and [service-worker lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

## Verified deployment — 24 September 2026

Production deployment: `c4dd20a5.bloch-space.pages.dev`, served by `bloch.space`.
The account database migration and production pepper were configured before
publishing. Thirty-two focused Node tests passed. Chrome checks on both localhost
and the public domain exercised all three research datasets, Graphus (53 returned
Bloch script references at inspection), registration, recovery-code issuance,
sign-in, preference persistence, logout, deletion and a fresh offline PWA load.
No page JavaScript errors or 390-pixel horizontal overflow were observed. The
service-worker cache contained no API response. Test accounts were deleted.

The remote desktop ZIP's SHA-256 matched the locally verified universal build:
`9941dab84271f4ff146452dd9aa3276acbe348b396ef1ff4cffca5462f8f5540`.
The bundle passed `codesign --verify --deep --strict`; `lipo` confirmed x86_64 and
arm64. The macOS application launched successfully. ARM execution and Apple
notarization were not performed. At inspection, Bloch's latest uninterrupted
monitoring segment was too short for AR(1), so that panel correctly withheld an
evaluation while descriptive clustering remained available. Bitcoin and Ethereum
had evaluated models; these results change as source windows change.

## Integrated address lookup

Address searches in the record explorer automatically call `/api/research` and
render source records, typed graph evidence, exact incident amounts, topology and
descriptive k-means when at least nine comparable references are available. The
same report is available at `https://rednblue.space/explore/` and in its private
Address research view. The shared [evidence viewer](unified-intelligence.md#address-evidence-inspection)
adds local direction/type/amount/block filters, typed graph navigation, exact event
and source inspection, complete filtered CSV and ML-group-to-reference navigation.
The **ETH + USDT + USDC** selection queries the same Ethereum address for all three
assets concurrently. Asset tabs retain separate balances, source captures, graph
filters and ML cohorts; a complete hashed bundle can be downloaded without merging
histories or private scores. See [combined address research](unified-intelligence.md#ethereum-address-query-across-assets).
Each tab can update or retry just that asset without collecting the other two or
clearing their filters. A failed update retains the original dated capture; a
successful one replaces the whole asset report and offers the previous bundle for
download until another successful update or new search. Token graph and ledger
activity share one validated request-local capture, while balance keeps its own
observation. Updates follow the existing public/private gateway budgets.
See [the unified research contract](unified-intelligence.md#unified-address-research)
for source coverage, native ETH limits, digest/export semantics and access controls.
