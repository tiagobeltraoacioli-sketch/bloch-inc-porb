import {KNOWLEDGE} from './knowledge.js';
import {deriveChainInsights} from './chain-insights.js';
import {selectAnswerEvidence} from './answer-evidence.js';

export const MODES = new Set(['summary','explain','checklist','example']);
export function compactObservations(context){
  return {network:context.network,subject:context.subject||null,sources:context.sources,facts:context.facts,
    transactions:[],graph:{nodes:[],edges:[]},status:context.status,coverage:context.coverage,observed_at:context.observed_at};
}
export function buildPublicGuide(portal,questionId,mode,context,options={}){
  const topic=KNOWLEDGE[portal]?.topics[questionId];if(!topic||!MODES.has(mode))throw new TypeError('invalid_guide');
  const sources=topic.sources.map(source=>({...source,retrieved_at:null,observed_at:null,status:'reference',coverage:`Curated protocol reference, reviewed ${topic.reviewed_at||'2026-09-28'}; not a live network measurement.`}));
  const derived=deriveChainInsights(context,options);
  const guide={...context,portal,question_id:questionId,title:topic.title,question:topic.question,mode,derived_facts:derived.facts,insights:derived.insights,
    knowledge:topic.notes.map(text=>({text,source_ids:topic.sources.map(source=>source.id),reference_scope:'topic'})),sources:[...context.sources,...sources]};
  const selected=selectAnswerEvidence(guide);
  return {...guide,answer_facts:selected.facts,answer_coverage:selected.limitations.join(' ')};
}
