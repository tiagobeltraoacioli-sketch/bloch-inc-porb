# Qentl public release — 2026-10-03

The public product is **Qentl — Quantum Entanglement, by Bloch Inc.**
`qentl.com` is canonical; `qentl.ai` and `blochai.xyz` serve the same public page.
The layout uses the Bloch Inc. design and supplied brand assets.

The embedded assistant button, panel title, accessible close label and About link
on `blochl1.com`, `bloch-graphus.xyz`, `bloch.space` and `bloch.space/app/` now use
**Qentl.ai**. The About link points to `https://qentl.ai/`. Existing API endpoints,
resource names, database bindings and public assistant behavior are preserved.

## Deployment and verification

- Cloudflare Worker: `blochai-public`.
- Current version: `a8f5f55a-76ed-4dc8-9ba1-81180eeabbc1`.
- Previous version, same product domains before button rename: `37caa22a-b778-4b7b-b0a9-3cbc0fd0d781`.
- Previous version before Qentl hub: `6781fb88-3ad7-470d-92f6-12be49d7d484`.
- Node integration tests: 19 passed; Wrangler dry run passed.
- Verified HTTPS content: all three product hubs and their brand assets matched;
  all four ecosystem entry points returned HTTP 200 with the new assistant label,
  panel and link. No old visible assistant brand remained in those rendered HTML responses.
- Browser visual/click review was unavailable in this environment.

A rollback can use the previous Worker version with Wrangler rollback after
checking routes and custom-domain bindings separately; a code rollback does not
revert DNS configuration automatically.

## Product boundaries

These product domains serve an informational page. The private Graphus code
workspace runs locally, authenticates with Rednblue and is not exposed by this
release. The account link opens the Rednblue portal. Desktop builds are described
as under validation. Private GPU capability claims are limited to observed smoke
cases. GPU rewards remain planned and inactive. No private prompts, credentials,
account databases or project content are included in public assets.
