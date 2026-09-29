# BlochAI topic relevance and source attribution

Public answers now select observations through an explicit reviewed map covering
all 60 catalog topics. Summary mode uses at most four relevant facts; other modes
use at most eight. A validator question prioritizes validator observations, while
a fee question uses chain-specific fee measurements and units. The full snapshot
still preserves up to 48 facts for inspection and export. Missing subject, token,
receipt, feature activation or historical evidence remains explicit.

Each new source fact receives its source identifier at the fixed fetch-plan
boundary. The coordinator rejects unknown, duplicate or unavailable source links.
Legacy snapshots remain readable and are marked as lacking per-fact attribution;
no source is guessed from a label. Values and units remain exact strings, including
amounts larger than JavaScript's safe integer range.

Reviewed notes identify their full topic reference set instead of assigning every
note to the first reference. This identifies a topic bibliography, not a verified
individual citation. Public answers remain assembled from reviewed notes and
source observations; an unchecked small-model draft is still withheld.

## Interface and exports

The public and authenticated private interfaces show source identifiers next to
facts and source cards. Public JSON adds `answer_facts` and `answer_coverage` while
retaining the full snapshot. CSV facts link to the matching source rows. PDFs
preserve fact source identifiers and source observation/retrieval times. Invalid
or unknown observation times are reported as not recorded; missing legacy
metadata does not receive an invented date or identifier.

The public asset version is `20260928-chain-4`. Scoped colors, keyboard focus and
mobile behavior remain in place. PDF generation stays local with same-origin
assets. The private application and AML routes retain their existing deployment;
private instructions, saved research and AML data do not enter public requests or
the synthetic training corpus. No database migration is required.

## Transaction export correction

The reported Bloch PDF showed generic From/To/Amount/Timestamp fields as unrecorded.
The source represents UTXO inputs and outputs, and its bounded network graph does
not supply transaction timestamps. The adapter now preserves separate outpoint,
script/address and exact base-unit values, plus block height/hash and slot when
provided. Later evidence enriches an existing transaction hash even after the
20-transaction limit is reached. Conflicting values or anchors remain omitted.

Input/output records are capped at 24 per side and 80 per snapshot. Source graph
coverage never becomes a claim of complete transaction history. UTXO exports use
separate input/output sections instead of inventing a single sender, recipient or
transfer amount. Missing transaction time is explained explicitly. CSV includes
parent transaction hashes, source links, anchors and separate input/output rows;
JSON and the browser preserve the same data. Account transactions retain declared
native value, with no inference of an ERC-20 transfer.

The original report is preserved. Live regression verification for its first
transaction, `b175dabd32b3cced98cda8fc5b3b12f5ab2eb86a269e58337f03bb46cc12c063`,
confirmed block 102217, slot 132142, one input and two outputs in PDF, CSV and JSON.
The source does not provide a transaction timestamp. This verification is a new
lookup of that transaction, not reconstruction of the original full report.

Derived readings retain their complete source-ID sets in the PDF. Private prompt
budgets now include only whole fact lines, preserving complete numbers, units and
source identifiers rather than cutting the final line at 400 characters.

## Verification before publication

284 coordinator tests and 118 web/portal contracts passed locally. Public browser
fixtures passed Graphus, Explorer and Space at 1440, 390 and 360 pixels, with
control contrast at least 4.5:1, local-only topic text, source-linked JSON/CSV and
PDF export. Private fixtures passed source attribution, research CRUD, PDF,
organization switching, logout clearing and mobile layout. PDF tests cover long
source IDs, large exact values, invalid dates and multi-page fact wrapping; the
five-page synthetic fixture was rendered and visually inspected.

## Training experiment

The separate `balanced-v2` profile fixes a 216-step schedule across all 27
network/scenario combinations. Validation and test each use 54 cases with complete
pairs. The plan is recorded before model loading. Evaluation fingerprints include
case identifiers, complete prompts and targets, and both baseline and candidate
use the same decoding settings. The corpus is synthetic and public-reference
based; this is a narrow evidence-copying/abstention experiment, not a claim of
open-ended blockchain expertise. Production model promotion remains manual and
is not part of this release.

## Published versions

Public Worker: `6781fb88-3ad7-470d-92f6-12be49d7d484`.
Private Worker: `c7c63aa0-c9a5-4597-928a-5d1a49921696`.
Coordinator archive SHA-256:
`abb6f2f0d7b06da5ba72e21c6957197a74248b8c937feddf55fd474c98c52944`.
The training runtime is separately staged and remains unchanged by the transaction
export correction. The isolated pilot restores its inference worker on exit.
