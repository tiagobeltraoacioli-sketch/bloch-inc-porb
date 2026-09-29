// Public answers publish reviewed notes and exact source observations, never an
// unchecked model draft. Source data remains distinguishable from interpretation.
export function sourceBasedAnswer(guide){
  if(!guide)return 'The saved source context is unavailable. Start a new research request.';
  const network={bitcoin:'Bitcoin',ethereum:'Ethereum',bloch:'Bloch'}[guide.network]||'Selected chain';
  const notes=(guide.knowledge||[]).map(item=>item.text).filter(text=>typeof text==='string');
  const limit=guide.mode==='summary'?4:8;
  const facts=(guide.facts||[]).slice(0,limit).map(fact=>`${fact.label}: ${fact.value}${fact.unit?' '+fact.unit:''}.`);
  const live=(guide.sources||[]).filter(source=>source.status!=='reference');
  const lines=[`${network} — ${guide.title||'Public chain research'}.`];
  if(guide.mode==='example')lines.push('Hypothetical reading exercise: compare the observed facts below with their source times and coverage. The observations are real source reports; no hypothetical amounts or transactions are added.');
  if(guide.status==='unavailable'||!facts.length)lines.push('Current observations are unavailable or contain no supported facts. Missing data does not mean zero activity.');
  else lines.push(`Observation status: ${guide.status}.`,...facts);
  if(guide.mode==='checklist')lines.push('Reading checklist:',...notes.slice(0,3).map((note,index)=>`${index+1}. ${note}`));
  else lines.push(...notes.slice(0,guide.mode==='summary'?2:3));
  const question=guide.question_id||'',priorities=/graph|connections|readings/.test(question)?['graph_structure','graph_degrees','transaction_sample']:/fees|gas/.test(question)?['fee_consistency','exact_amount','source_freshness']:/wallet|balance/.test(question)?['exact_amount','transaction_sample','source_freshness']:/transaction|utxo|eutxo/.test(question)?['transaction_sample','fee_consistency','exact_amount','graph_structure']:/freshness|health|coverage/.test(question)?['source_freshness','source_coverage','checkpoint_gap']:/finality|consensus|blocks/.test(question)?['checkpoint_gap','source_freshness','graph_structure']:['exact_amount','graph_structure','source_freshness'];
  const insights=(guide.insights||[]).filter(item=>item&&typeof item.text==='string').sort((a,b)=>{const rank=id=>priorities.includes(id)?priorities.indexOf(id):10;return rank(a.id)-rank(b.id);});
  for(const insight of insights.slice(0,guide.mode==='summary'?2:3))lines.push(`${insight.title}${insight.status!=='available'?` (${insight.status})`:''}: ${insight.text}`);
  for(const source of live)lines.push(`${source.title} (${source.status}): ${source.coverage} Observed: ${source.observed_at||'not recorded'}. Retrieved: ${source.retrieved_at||'not recorded'}.`);
  if(!live.length)lines.push('No live source was recorded. Protocol references are listed separately.');
  return lines.join('\n\n');
}
