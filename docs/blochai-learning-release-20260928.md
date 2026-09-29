# BlochAI knowledge, evidence and grounding pilot

This update expands reviewed portal knowledge from 35 to 60 topics, with 20 per
portal and 31 primary references. Each topic has an explicit network allowlist
and review date. Both public edge and coordinator reject a topic requested for
an unsupported network. The browser filters choices before submission.

## More public evidence

The source projection preserves up to 48 facts. Bitcoin observations now include
complete input/output record totals, exact fee differences, sequence replacement
signals, validated outspend counts, virtual size and bounded source fee estimates.
Coinbase or incomplete prevouts cannot produce an ordinary derived fee.
Ethereum observations include gas, nonce, matched-receipt execution fees, separate
blob fees and log counts. Receipt transaction hash, block hash and block number
must all match. Amounts remain decimal integer strings; gas prices use wei/gas.
Bloch observations add available epoch, mempool and indexer measurements.

Deterministic readings describe exact coin notation, fee consistency, graph
sample density/degrees/components, distinct transaction references, checkpoint
distance and separate observation/retrieval ages. They disclose incomplete data
and never establish owner identity, intent, risk or complete chain history.
Source facts remain separate from up to 4 derived facts and 8 source-linked
readings. Public answers retain the source-summary guard against unchecked
small-model drafts. Training does not disable that guard.

## Portal and export behavior

The same readings appear in authenticated private research after its date filter.
Private date limits still apply only to dated records in the returned sample;
filtered graphs are omitted. Instructions, prompts, presets and AML information
remain in the authenticated private path and never enter the public adapter or
training corpus. Public requests still use approved topic identifiers.

PDFs include source facts, derived readings, graph and transaction records within
the 60-fact export bound. CSV includes source identifiers, observation/retrieval
times and coverage, allowing derived readings to be traced to source rows. Public
JSON preserves distinct data layers. Private PDFs remain CONFIDENTIAL and require
session revalidation. Export generation uses same-origin resources locally.

The assistant asset release is `20260928-chain-3`. Existing scoped contrast,
keyboard focus and mobile layout checks remain required. Dedicated Worker routes
preserve the existing private AML application and its agents/memory/report routes.
No database migration is required by this update.

## Isolated training scope

The reviewed dataset contains 2,088 public-reference/synthetic examples:
1,134 training, 360 validation and 594 test. Concept, scenario, template and prompt
splits are audited; exact example bytes are regenerated before loading. The pilot
teaches copying supplied evidence and abstaining on missing, identity, AML or
out-of-scope requests. Public notes are provenance metadata; this is not a claim
that the adapter learned all reference content or open-ended blockchain analysis.

The pilot runs in a separate pinned environment and service on one authorized
A16-2Q. It has no network or access to inference configuration/state. Reservation
checks existing assignments without reading task bodies; an independent watchdog
and service cleanup restore the inference worker. The other 12 workers remain
available. The base model and production adapter configuration are unchanged.

The initial 256-token inspection would have excluded all hash examples. The
chosen 384-token limit retains all examples without truncation (maximum 315 tokens
across all splits). An initial run stopped before training because the 1,600 MiB
post-CUDA check exceeded actual free memory; its report is retained. The retry
uses a 1,536 MiB post-initialization floor while retaining the 1,600 MiB external
reservation check. Actual outcomes must be recorded separately from this setup.

## Verification

The coordinator test suite, public/private boundary contracts, exact arithmetic,
network restrictions, source outages and export bounds were checked locally.
All 464 approved topic/network/style prompt combinations fit the production
context budget (maximum 715 input tokens with representative public snapshots,
plus 256 output tokens within the 2,048-token limit).

Release evidence and model pilot outputs are kept in ignored operational
folders; credentials and private records are excluded from Git. A candidate is
never promoted automatically, including after successful synthetic evaluation.

## Published versions and observed coverage

The public Worker is `b678421f-c799-4184-8b5a-31803b6b634d`; the private Worker
is `bf11fbcf-c73c-4dd2-9f01-20e8389e34c8`. Local checks passed 87 web/portal
contracts and 227 coordinator tests, including the final memory-preflight and precision checks.
Public browser fixtures passed all three portals at 1440, 390 and 360 pixels.

Live Graphus and Space verification completed one GPU task each and exported
PDF/CSV/JSON with source-linked readings. Both retained at least 5.65:1 control
contrast and had no page or panel overflow. The Explorer task completed but its
three live sources were unavailable in that snapshot; the answer and exports
reported the outage and contained no invented observations. Follow-up read-only
probes returned HTTP 503 from the Bloch overview and HTTP 502 from validators.
Increasing the client timeout alone would not repair those upstream failures.
Explorer mobile/Clear live checks were not reached in the first run; a single
subsequent Explorer recheck passed after the source timeout adjustment below. All pages of the three downloaded PDFs (7, 4 and 3 pages) were inspected.

Private browser fixtures passed research CRUD, source readings, graph/transaction
PDFs, organization switching, logout and mobile layouts. Its synthetic PDF had
three pages and was visually inspected. Operational live results and the actual
adapter evaluation are recorded below only after completion.

Live private verification then completed one synthetic GPU request with 12 ready
workers while the training worker was reserved. It returned 6 source facts,
4 derived facts and 4 readings with a public Ethereum observation. The downloaded
CONFIDENTIAL PDF had 2 pages; extraction and visual inspection verified source
IDs and readings. Preset cleanup, logout clearing, mobile layouts and the absence
of external PDF uploads passed. The 64-token sample validates execution and export,
not the completeness or analytical quality of free-form model prose.

Read-only production privacy checks passed public/private token separation,
private-task concealment, public raw-prompt/foreign-origin rejection and private
session enforcement. The original AML portal application hash remained
`f32e94e8b740870e56c8fd8049d9a5bc49f384c4c22b7aca9b57cd4af3768d67`, excluding
only the observed provider Insights script injection.

The first memory retry performed seven optimizer steps before CUDA ran out of
memory; it produced no evaluated adapter and restored its worker automatically.
The next precision attempt stopped before training due to a mixed-dtype matmul;
its report is retained. The corrected final runtime casts only frozen embedding
and output weights to the compute dtype, preserves their shared storage and
keeps normalization and trainable LoRA weights in FP32. Both baseline and
candidate generation use the same autocast policy. None of the unsuccessful
runs altered production inference or its model cache.

## Completed pilot

The final isolated run completed 40 optimizer steps in 128.12 seconds and restored
its worker. It retained every training example and all nine scenarios. On the
same 18 held-out synthetic cases, complete exact answers improved from 0/18 to 4/18,
valid schema answers from 0/18 to 10/18 and exact facts/units/source identifiers
from 0/18 to 8/18. Correct abstentions improved from 0/10 to 4/10. All four correct answers concern missing or unavailable evidence. Observed-fact
copying remains 0/8, and ownership, private-AML and off-topic decisions still fail.
This is a limited improvement in missing-data abstention; it is insufficient for
production. The candidate was preserved without promotion; the public
source-summary guard and the production model remain in place.

The final fleet audit passed all 13 hosts: source manifests matched, all 13 GPU
runtimes were ready and no unrelated service was unexpectedly stopped.

A later read-only probe showed the Bloch sources recovering to HTTP 200. The
Graphus response took 9.39 seconds, beyond the previous 7-second source budget.
The source budget was increased to 12 seconds, retaining concurrent bounded
requests and no retries. This helps slower healthy observations; errors and
missing data still remain explicit.

The final Explorer recheck passed with available graph and validator observations
and an explicitly unavailable overview: 12 source facts, 4 derived facts, 5 readings,
20 transactions and a 40-node/80-edge displayed graph. Contrast, all three viewport
widths, Clear and PDF/CSV/JSON downloads passed. Its partial status is intentional;
missing network-overview facts are not reconstructed from other observations.
The original outage record and the first two portal results were preserved.

The final Explorer PDF had 14 pages; every page was rendered and inspected,
with no text outside the page, clipping or overlap.
