// Public answers publish reviewed notes and exact source observations, never an
// unchecked model draft. Source data remains distinguishable from interpretation.
import {answerInsightPriority,selectAnswerEvidence} from './answer-evidence.js';

export function sourceBasedAnswer(guide){
  if(!guide)return 'The saved source context is unavailable. Start a new research request.';
  const network={bitcoin:'Bitcoin',ethereum:'Ethereum',bloch:'Bloch'}[guide.network]||'Selected chain';
  const notes=(guide.knowledge||[]).map(item=>item.text).filter(text=>typeof text==='string');
  const selected=selectAnswerEvidence(guide);
  const facts=selected.facts.map(fact=>{
    const source=fact.source_id==null?null:(guide.sources||[]).find(source=>source.id===fact.source_id);
    return `${fact.label}: ${fact.value}${fact.unit?' '+fact.unit:''}. ${source?`Source: ${source.title||source.id} [${source.id}] (${source.status}).`:'Per-fact source attribution: not recorded.'}`;
  });
  const live=(guide.sources||[]).filter(source=>source.status!=='reference');
  const lines=[`${network} — ${guide.title||'Public chain research'}.`];
  if(guide.mode==='example')lines.push('Hypothetical reading exercise: compare the observed facts below with their source times and coverage. The observations are real source reports; no hypothetical amounts or transactions are added.');
  if(guide.status==='unavailable')lines.push('Current observations are unavailable or contain no supported facts. Missing data does not mean zero activity.');
  else if(!facts.length)lines.push(`Observation status: ${guide.status}. No directly relevant source facts are available for this topic. Missing data does not mean zero activity.`);
  else lines.push(`Observation status: ${guide.status}.`,...facts);
  lines.push(...selected.limitations);
  if(guide.mode==='checklist')lines.push('Reading checklist:',...notes.slice(0,3).map((note,index)=>`${index+1}. ${note}`));
  else lines.push(...notes.slice(0,guide.mode==='summary'?2:3));
  const referenceIds=new Set((guide.knowledge||[]).flatMap(note=>Array.isArray(note.source_ids)?note.source_ids:[]));
  const references=(guide.sources||[]).filter(source=>source.status==='reference'&&(!referenceIds.size||referenceIds.has(source.id)));
  if(notes.length&&references.length)lines.push(`Topic reference set: ${references.map(source=>`${source.title} [${source.id}]`).join('; ')}. These references support the reviewed topic notes, not live measurements.`);
  const priorities=answerInsightPriority(guide);
  const insights=(guide.insights||[]).filter(item=>item&&typeof item.text==='string').sort((a,b)=>{const rank=id=>priorities.includes(id)?priorities.indexOf(id):10;return rank(a.id)-rank(b.id);});
  for(const insight of insights.slice(0,guide.mode==='summary'?2:3))lines.push(`${insight.title}${insight.status!=='available'?` (${insight.status})`:''}: ${insight.text}`);
  for(const source of live)lines.push(`${source.title} (${source.status}): ${source.coverage} Observed: ${source.observed_at||'not recorded'}. Retrieved: ${source.retrieved_at||'not recorded'}.`);
  if(!live.length)lines.push('No live source was recorded. Protocol references are listed separately.');
  return lines.join('\n\n');
}
