import {KNOWLEDGE} from './knowledge.js';

export const MODES = new Set(['summary','explain','checklist','example']);
export function compactObservations(context){
  return {network:context.network,subject:context.subject||null,sources:context.sources,facts:context.facts,
    transactions:[],graph:{nodes:[],edges:[]},status:context.status,coverage:context.coverage,observed_at:context.observed_at};
}
export function buildPublicGuide(portal,questionId,mode,context){
  const topic=KNOWLEDGE[portal]?.topics[questionId];if(!topic||!MODES.has(mode))throw new TypeError('invalid_guide');
  const sources=topic.sources.map(source=>({...source,retrieved_at:null,observed_at:null,status:'reference',coverage:'Curated protocol reference, reviewed 2026-09-28; not a live network measurement.'}));
  return {...context,portal,question_id:questionId,title:topic.title,question:topic.question,mode,
    knowledge:topic.notes.map(text=>({text,source_id:topic.sources[0].id})),sources:[...context.sources,...sources]};
}
