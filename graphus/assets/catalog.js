const fields=[];
function add(layer,status,access,rows){
  rows.forEach(([name,meaning])=>fields.push({layer,status,access,name,meaning}));
}
add('Network & asset','design','public',[
  ['network_id','Canonical chain and network namespace; prevents cross-network address collisions.'],
  ['asset_id','Exact native asset or issuer-pinned ERC-20 contract identity.'],
  ['asset_standard','Native coin, ERC-20 token, or Bloch output semantics.'],
  ['contract_address','Ethereum token emitter; only allowlisted mainnet USDT and USDC in the first wave.'],
  ['asset_decimals','Display precision from a verified source; stored values remain exact integers.'],
  ['source_endpoint','Origin of the observation with rights and reliability metadata.'],
  ['chain_height','Reported Bitcoin/Ethereum height or Bloch indexer position; source probes are active.'],
  ['coverage_window','The exact indexed range and gaps once production ingestion exists.'],
]);
add('Raw event','offline prototype','public',[
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
add('Finality & quality','offline prototype','public',[
  ['finality_state','Observed, confirmed, finalized, orphaned or rolled back.'],
  ['confirmations','Chain-specific depth; never a universal finality guarantee.'],
  ['reorg_revision','Revision increment when canonical history changes.'],
  ['source_lag','Delay from source head to last confirmed indexed event.'],
  ['missing_range','Declared data gaps and backfill status.'],
  ['parse_version','Adapter and schema version that produced the record.'],
  ['reconciliation_result','Cross-check outcome against independent source totals.'],
  ['data_quality_flags','Ambiguous, incomplete, stale or conflicting source evidence.'],
]);
add('Wallet & flow','design','public',[
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
add('Time & behavior','design','public',[
  ['first_last_observed','First and last seen inside the indexed coverage window.'],
  ['activity_1h_24h_7d','Event counts by non-overlapping, versioned observation windows.'],
  ['burstiness','Variation in inter-event gaps with sparse-data warning.'],
  ['dwell_time','Elapsed time between supported inbound and outbound observations.'],
  ['fan_in_fan_out','Windowed distinct source and destination breadth.'],
  ['value_concentration','Share of volume in largest observed events or counterparties.'],
  ['cycle_candidate','Time-ordered path returning to a reference, with hub and change-output caveats.'],
  ['pass_through_candidate','Short-horizon in/out pattern as a review lead, not intent.'],
]);
add('Official sources','running OFAC only','public',[
  ['source_registry_id','Official source, schema, retrieval time, license and parser version.'],
  ['snapshot_digest','Hash of the exact source snapshot used for a match.'],
  ['ofac_exact_identifier','Official SDN digital-currency address match; private screening response only.'],
  ['un_reference','UN Security Council listing reference; integration is planned, not connected.'],
  ['uk_sanctions_reference','UK Sanctions List reference; integration is planned, not connected.'],
  ['eu_sanctions_reference','EU official financial-sanctions reference; integration is planned, not connected.'],
  ['claim_observed_expires','When a claim was seen and when it must be rechecked.'],
  ['source_dispute_state','Correction or conflict state rather than permanent asserted truth.'],
]);
fields.filter(item=>item.layer==='Official sources').forEach(item=>{
  if(['un_reference','uk_sanctions_reference','eu_sanctions_reference'].includes(item.name))item.status='design';
  if(item.name==='ofac_exact_identifier'){item.access='private';item.status='local prototype';}
});
add('ML transparency','design','public',[
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
add('Statistical analysis','design','public',[
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
add('Privacy & governance','design','private',[
  ['account_identity','Minimal registration subject and email in an authenticated store.'],
  ['private_annotation','User-owned note text, never in public graph or DaaS output.'],
  ['customer_case','Tenant-scoped review record and human decision.'],
  ['ip_country_context','Short-lived, fallible jurisdiction inference from lawful customer context; no raw IP retained.'],
  ['source_licence','Rights that govern internal use, redistribution and derived public output.'],
  ['lawful_basis','Documented processing ground and purpose for personal data.'],
  ['retention_expiry','Per-record lifetime, correction, deletion and reprocessing rule.'],
  ['access_audit','Who accessed a restricted record, why, and under which grant.'],
]);
add('Delegated intelligence','design','delegated',[
  ['aml_score','Future validated score, accessible only under an explicit scoped grant.'],
  ['score_version','Model, calibration and policy version behind the protected score.'],
  ['score_grant_id','Named grantee, tenant, purpose, wallet/case scope, expiry and revocation state.'],
  ['human_review_state','Reviewer disposition before consequential customer use.'],
]);

const body=document.getElementById('field-rows');
const search=document.getElementById('field-search');
const group=document.getElementById('group-filter');
const access=document.getElementById('access-filter');
document.getElementById('field-count').textContent=String(fields.length).padStart(2,'0');
[...new Set(fields.map(item=>item.layer))].forEach(value=>{const option=document.createElement('option');option.value=value;option.textContent=value;group.append(option);});
function render(){
  const needle=search.value.trim().toLowerCase();body.replaceChildren();
  const visible=fields.filter(item=>(group.value==='all'||item.layer===group.value)&&(access.value==='all'||item.access===access.value)&&(!needle||`${item.layer} ${item.name} ${item.meaning}`.toLowerCase().includes(needle)));
  visible.forEach(item=>{
    const row=document.createElement('tr');
    [item.layer,item.name,item.meaning,item.access,item.status].forEach(value=>{const cell=document.createElement('td');cell.textContent=value;row.append(cell);});
    body.append(row);
  });
  document.getElementById('catalog-result').textContent=`${visible.length} of ${fields.length} fields shown · status is implementation evidence, not production coverage`;
}
[search,group,access].forEach(control=>control.addEventListener(control===search?'input':'change',render));
render();
