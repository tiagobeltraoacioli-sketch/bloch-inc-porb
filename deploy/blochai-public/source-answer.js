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
  for(const source of live)lines.push(`${source.title} (${source.status}): ${source.coverage} Observed: ${source.observed_at||'not recorded'}. Retrieved: ${source.retrieved_at||'not recorded'}.`);
  if(!live.length)lines.push('No live source was recorded. Protocol references are listed separately.');
  return lines.join('\n\n');
}
