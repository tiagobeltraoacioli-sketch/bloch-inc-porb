const definitions=[];
function add(layer,access,rows){
  rows.forEach(([name,meaning])=>definitions.push({layer,access,name,meaning}));
}
add('Network & asset','public',[
  ['network_id','Canonical chain and network namespace; prevents cross-network address collisions.'],
  ['asset_id','Exact native asset or issuer-pinned ERC-20 contract identity.'],
  ['asset_standard','Native coin, ERC-20 token, or Bloch output semantics.'],
  ['contract_address','Ethereum token emitter; only allowlisted mainnet USDT and USDC in the first wave.'],
  ['asset_decimals','Display precision from a verified source; stored values remain exact integers.'],
  ['source_endpoint','Origin of the observation with rights and reliability metadata.'],
  ['chain_height','Reported Bitcoin/Ethereum height or Bloch indexer position; source probes are active.'],
  ['coverage_window','The exact indexed range and gaps once production ingestion exists.'],
]);
add('Raw event','public',[
  ['transaction_id','Chain transaction hash or Bloch transaction identifier.'],
  ['event_index','Output, log, or movement index inside a transaction.'],
  ['block_hash','Block identity used to detect replacement and rollback.'],
  ['block_height_or_slot','Chain position, kept with network-specific meaning.'],
  ['observed_at','Time of source observation; distinct from block time.'],
  ['ingested_at','Time Graphus received and versioned the event.'],
  ['amount_raw','Exact integer quantity in the native smallest unit.'],
  ['transaction_success','Execution or inclusion condition required before an event is treated as a movement.'],
  ['receipt_log_identity','Ethereum receipt, log index, emitter and Transfer signature.'],
  ['outpoint','Bitcoin or Bloch transaction output reference.'],
]);
add('Finality & quality','public',[
  ['finality_state','Observed, confirmed, finalized, orphaned or rolled back.'],
  ['confirmations','Chain-specific depth; never a universal finality guarantee.'],
  ['reorg_revision','Revision increment when canonical history changes.'],
  ['source_lag','Delay from source head to last confirmed indexed event.'],
  ['missing_range','Declared data gaps and backfill status.'],
  ['parse_version','Adapter and schema version that produced the record.'],
  ['reconciliation_result','Cross-check outcome against independent source totals.'],
  ['data_quality_flags','Ambiguous, incomplete, stale or conflicting source evidence.'],
]);
add('Wallet & flow','public',[
  ['address_or_script','Chain-scoped address or script reference; never presumed person identity.'],
  ['flow_from','Observed sender role where chain semantics support it. Bitcoin ownership is not inferred from inputs.'],
  ['flow_to','Observed recipient, output script, or token log destination.'],
  ['counterparty_count','Distinct observed network references inside a stated time window.'],
  ['inbound_outbound_count','Event counts by direction and chain-specific attribution.'],
  ['volume_by_asset','Exact value totals per asset; unlike units are never added.'],
  ['flow_edge_type','Spends, creates, emits log, transfers token, or verified bridge mapping.'],
  ['bridge_proof_ref','Proof or signed message required before cross-chain flow is joined.'],
  ['shared_service_warning','Known exchange, router or infrastructure hub can confound a direct path.'],
  ['path_hop_count','Bounded traversals only; distance is not guilt or ownership.'],
]);
add('Time & behavior','public',[
  ['first_last_observed','First and last seen inside the indexed coverage window.'],
  ['activity_1h_24h_7d','Event counts by non-overlapping, versioned observation windows.'],
  ['burstiness','Variation in inter-event gaps with sparse-data warning.'],
  ['dwell_time','Elapsed time between supported inbound and outbound observations.'],
  ['fan_in_fan_out','Windowed distinct source and destination breadth.'],
  ['value_concentration','Share of volume in largest observed events or counterparties.'],
  ['cycle_candidate','Time-ordered path returning to a reference, with hub and change-output caveats.'],
  ['pass_through_candidate','Short-horizon in/out pattern as a review lead, not intent.'],
]);
add('Official sources','public',[
  ['source_registry_id','Official source, schema, retrieval time, license and parser version.'],
  ['snapshot_digest','Hash of the exact source snapshot used for a match.'],
  ['ofac_exact_identifier','Official SDN digital-currency address match; private screening response only.'],
  ['un_reference','UN Security Council listing reference; integration is planned, not connected.'],
  ['uk_sanctions_reference','UK Sanctions List reference; integration is planned, not connected.'],
  ['eu_sanctions_reference','EU official financial-sanctions reference; integration is planned, not connected.'],
  ['claim_observed_expires','When a claim was seen and when it must be rechecked.'],
  ['source_dispute_state','Correction or conflict state rather than permanent asserted truth.'],
]);
add('ML transparency','public',[
  ['feature_schema','Named feature, definition, units, chain semantics, and missing-value rule.'],
  ['feature_value','Lawful non-score value with source lineage and calculation window.'],
  ['feature_revision','Code and input snapshot identities for reproducibility.'],
  ['model_version','Pinned model artifact and release status once a model exists.'],
  ['training_cutoff','Latest time allowed into the training set.'],
  ['validation_cohort','Time and entity-disjoint holdout construction.'],
  ['precision_at_review_capacity','Observed precision at an actual analyst workload, with confidence interval.'],
  ['recall_and_false_positive_rate','Measured missed cases and review burden on held-out labels.'],
  ['calibration_and_drift','Probability calibration and post-deployment distribution change.'],
  ['uncertainty_and_alternatives','Missing data, competing explanations, and unsupported inferences.'],
]);
add('Statistical analysis','public',[
  ['observation_window','Exact date range and completeness denominator for a calculation.'],
  ['daily_event_rate','Observed events per day, separated by asset and direction.'],
  ['daily_volume_series','Exact-unit daily totals with zero and missing days distinguished.'],
  ['regression_specification','Response, predictors, transformations, exclusions, and cohort definition.'],
  ['trend_slope','Descriptive change per time unit; not a causal or AML conclusion.'],
  ['confidence_interval','Uncertainty interval and sample size for reported estimates.'],
  ['fit_diagnostics','Residuals, R-squared, outliers, and instability warning.'],
  ['cohort_comparison','Like-for-like peer baseline without revealing private identities.'],
  ['multiple_testing_warning','Alert when many hypotheses make incidental patterns likely.'],
  ['causal_limitations','Explicit confounders, selection bias, and alternative explanations.'],
]);
add('Privacy & governance','private',[
  ['account_identity','Minimal registration subject and email in an authenticated store.'],
  ['private_annotation','User-owned note text, never in public graph or DaaS output.'],
  ['customer_case','Tenant-scoped review record and human decision.'],
  ['ip_country_context','Short-lived, fallible jurisdiction inference from lawful customer context; no raw IP retained.'],
  ['source_licence','Rights that govern internal use, redistribution and derived public output.'],
  ['lawful_basis','Documented processing ground and purpose for personal data.'],
  ['retention_expiry','Per-record lifetime, correction, deletion and reprocessing rule.'],
  ['access_audit','Who accessed a restricted record, why, and under which grant.'],
]);
add('Delegated intelligence','delegated',[
  ['aml_score','Future validated score, accessible only under an explicit scoped grant.'],
  ['score_version','Model, calibration and policy version behind the protected score.'],
  ['score_grant_id','Named grantee, tenant, purpose, wallet/case scope, expiry and revocation state.'],
  ['human_review_state','Reviewer disposition before consequential customer use.'],
]);

export const ATLAS_VERSION = 'graphus-atlas-1.0.0';
export const ASSETS = Object.freeze({
  BTC:{network:'bitcoin-mainnet',id:'bitcoin-mainnet:native:BTC',standard:'UTXO',decimals:8,unit:'satoshi',contract:null},
  ETH:{network:'ethereum-mainnet',id:'ethereum-mainnet:native:ETH',standard:'native',decimals:18,unit:'wei',contract:null},
  USDT:{network:'ethereum-mainnet',id:'ethereum-mainnet:erc20:0xdac17f958d2ee523a2206206994597c13d831ec7',standard:'ERC-20',decimals:6,unit:'token base units',contract:'0xdac17f958d2ee523a2206206994597c13d831ec7'},
  USDC:{network:'ethereum-mainnet',id:'ethereum-mainnet:erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',standard:'ERC-20',decimals:6,unit:'token base units',contract:'0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'},
  BLCH:{network:'bloch-mainnet',id:'bloch-mainnet:native:BLCH',standard:'UTXO',decimals:8,unit:'base units',contract:null},
});
const privateFields = new Set(['account_identity','private_annotation','customer_case','source_licence','lawful_basis','retention_expiry','access_audit','source_dispute_state','ofac_exact_identifier','score_version','score_grant_id','human_review_state']);
const gated = {
  bridge_proof_ref:'No verified bridge receipt adapter is connected; cross-chain paths are never inferred.',
  ip_country_context:'No lawful customer jurisdiction context is supplied to the public Atlas; no raw IP is retained.',
  aml_score:'No validated AML model exists. Descriptive observation scores cannot substitute for one.',
};
const evaluationFields = new Set(['training_cutoff','validation_cohort','precision_at_review_capacity','recall_and_false_positive_rate','calibration_and_drift']);
const methods = {
  'Network & asset':'Pinned asset registry and validated source snapshot.',
  'Raw event':'Validated typed source records; no inferred movements.',
  'Finality & quality':'Source anchors, explicit omissions and optional baseline comparison.',
  'Wallet & flow':'Directed adjacency over the selected records; exact amounts grouped by asset, direction and record type.',
  'Time & behavior':'UTC block timestamps within the selected sample; missing times are excluded and counted.',
  'Official sources':'Versioned official-source registry; claims and corrections require the private workspace.',
  'ML transparency':'Versioned feature definitions and deterministic calculation lineage; evaluation requires a declared holdout.',
  'Statistical analysis':'Daily observed buckets, ordinary least squares and descriptive same-sample cohorts.',
  'Privacy & governance':'Authenticated tenant-scoped records with scoped access and access audit.',
  'Delegated intelligence':'Explicit scoped access to descriptive observation scores; validated AML release remains gated.',
};
const overrides = {
  coverage_window:'Captured block ranges, source pages, declared omissions and unknown history.',
  chain_height:'Highest source anchor in the captured sample; not a current network-tip claim.',
  source_endpoint:'Public source identity and published origin; configured RPC credentials and paths stay server-side.',
  source_lag:'Source head-to-latest-selected-record distance at capture time, with the head kind disclosed. This is not node synchronization lag.',
  ingested_at:'Time this analysis accepted the packet; source retrieval and block times remain distinct.',
  counterparty_count:'Distinct adjacent references. UTXO neighbors are transaction nodes, not inferred owners or counterparties.',
  activity_1h_24h_7d:'Disjoint age bands: 0–1 hour, 1–24 hours and 24–168 hours before the analysis window end.',
  dwell_time:'Nearest strictly earlier inbound observation before each outbound event. Not coin-level residence time.',
  shared_service_warning:'High-degree sample structure warning; no exchange, router or service identity is asserted.',
  un_reference:'Official UN listing references from a bounded private snapshot lookup; no name matching.',
  uk_sanctions_reference:'Official UK listing references from a bounded private snapshot lookup; no name matching.',
  eu_sanctions_reference:'Official EU listing references from a bounded private snapshot lookup; no name matching.',
  model_version:'Pinned Atlas transform version and separate private observation-model metadata; no public AML model.',
  score_version:'Model and policy versions of tenant-private descriptive observation scores.',
  score_grant_id:'Named grantee and purpose, one reference in a retained analysis, expiry and revocation, with a current scoped human review.',
};
export const FIELDS = Object.freeze(definitions.map(field => ({
  ...field,meaning:overrides[field.name]||field.meaning,
  access:privateFields.has(field.name)||['un_reference','uk_sanctions_reference','eu_sanctions_reference'].includes(field.name)?'private':field.access,
  implementation:gated[field.name]?'gated':privateFields.has(field.name)?'private':evaluationFields.has(field.name)?'evaluation':
    ['un_reference','uk_sanctions_reference','eu_sanctions_reference'].includes(field.name)?'private':'implemented',
  method:methods[field.layer],
  missing_value:'null with an explicit state and reason; never an inferred zero',
  units:['amount_raw','volume_by_asset','daily_volume_series'].includes(field.name)?'integer base-unit strings':'see value schema',
  release_gate:gated[field.name]||null,
  endpoint:privateFields.has(field.name)?'/api/porb/v1/atlas/private':evaluationFields.has(field.name)?'browser-local evaluation':
    ['un_reference','uk_sanctions_reference','eu_sanctions_reference'].includes(field.name)?'/api/porb/v1/atlas/sources':'/api/atlas/analyze',
})));
export function atlasSchema() {
  return {schema_version:1,version:ATLAS_VERSION,fields:FIELDS,assets:ASSETS,
    states:['available','partial','unavailable','not_applicable','private','gated'],
    limits:{pages:8,records:4000,references:1200,packet_bytes:6000000,days:366,path_hops:6,path_expansions:20000},
    invariants:['Integer amounts remain exact strings.','Missing time or coverage is never replaced by zero.',
      'UTXO inputs and outputs remain separate.','Public results contain no identity, private notes or scores.',
      'Availability describes this result, not full-chain coverage or model validation.']};
}
