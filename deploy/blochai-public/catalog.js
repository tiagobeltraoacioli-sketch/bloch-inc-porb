import {KNOWLEDGE} from './knowledge.js';

export const ASSISTANT_ASSET_VERSION='20260928-chain-4';

const configurations = {
  'bloch-graphus.xyz': {id:'graphus',name:'Graphus',scope:'Explore public graphs, connections, provenance and coverage.'},
  'bloch.space': {id:'space',name:'Bloch Space',scope:'Explore Bitcoin, Ethereum and Bloch observations and network research.'},
  'blochl1.com': {id:'explorer',name:'Bloch Explorer',scope:'Explore Bloch blocks, transactions, eUTXO and source coverage.'}
};
export const publicPortals = Object.freeze(Object.fromEntries(Object.entries(configurations).map(([host,portal])=>{
  const topics=KNOWLEDGE[portal.id].topics;
  return [host,{...portal,topics,questions:Object.fromEntries(Object.entries(topics).map(([id,topic])=>[id,topic.question]))}];
})));
const escape=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function assistantMarkup(host){
  const portal=publicPortals[host],topics=Object.entries(portal.topics),catalog=topics.map(([id,topic])=>({id,title:topic.title,question:topic.question,keywords:topic.keywords||[],networks:topic.networks||(portal.id==='explorer'?['bloch']:['bitcoin','ethereum','bloch'])}));
  return `<div class="blochai-assistant" data-blochai-portal="${portal.id}" data-blochai-name="${portal.name}" data-blochai-catalog="${escape(JSON.stringify(catalog))}">
<button class="blochai-assistant__trigger" type="button" aria-controls="blochai-assistant-panel" aria-expanded="false">Qentl.ai <span aria-hidden="true">↗</span></button>
<section id="blochai-assistant-panel" class="blochai-assistant__panel" role="dialog" aria-labelledby="blochai-assistant-title" hidden>
<header class="blochai-assistant__header"><div><span class="blochai-assistant__eyebrow">YOUR PORTAL COMPANION</span><h2 id="blochai-assistant-title">Qentl.ai for ${portal.name}</h2></div><button type="button" class="blochai-assistant__close" aria-label="Close Qentl.ai">×</button></header>
<p class="blochai-assistant__scope">${portal.scope}</p>
<p class="blochai-assistant__note">Find a topic in your own words, then explore public records. Topic matching happens on this device; your typed topic text is never sent.</p>
<div class="blochai-assistant__toolbar"><span class="blochai-assistant__count">0 / 12 explanations</span><button type="button" class="blochai-assistant__export" disabled>Download PDF</button><button type="button" class="blochai-assistant__clear" disabled>Clear</button></div>
<div class="blochai-assistant__history" aria-label="Conversation"></div>
<form class="blochai-assistant__form">
<div class="blochai-assistant__network-field"${portal.id==='explorer'?' hidden':''}><label for="blochai-assistant-network">Network context</label><select id="blochai-assistant-network" name="network"><option value="bloch">Bloch</option>${portal.id==='explorer'?'':'<option value="bitcoin">Bitcoin</option><option value="ethereum">Ethereum</option>'}</select></div>
<label for="blochai-assistant-search">What would you like to understand?</label><input id="blochai-assistant-search" class="blochai-assistant__search" type="text" maxlength="240" autocomplete="off" placeholder="Try a topic in English or Portuguese">
<p class="blochai-assistant__match" role="status">Choose a topic below, or type to find one.</p>
<div class="blochai-assistant__topics" aria-label="Portal topics">${topics.map(([id,topic])=>`<button type="button" class="blochai-assistant__topic" data-topic="${escape(id)}" aria-pressed="false">${escape(topic.title)}</button>`).join('')}</div>
<label for="blochai-assistant-question">Matched topic</label><select id="blochai-assistant-question" name="question_id"><option value="">Choose a portal topic</option>${topics.map(([id,topic])=>`<option value="${escape(id)}">${escape(topic.question)}</option>`).join('')}</select>
<label for="blochai-assistant-mode">Response style</label><select id="blochai-assistant-mode" name="mode"><option value="explain">Explain</option><option value="summary">Quick summary</option><option value="checklist">Checklist</option><option value="example">Worked example</option></select>
<label for="blochai-assistant-subject">Public data to explore</label><select id="blochai-assistant-subject" name="subject_kind"><option value="network">Network overview</option><option value="address">Address / script reference</option><option value="transaction">Transaction</option></select>
<div class="blochai-assistant__reference-input" hidden><label for="blochai-assistant-reference">Public reference</label><input id="blochai-assistant-reference" name="subject_value" type="text" maxlength="120" autocomplete="off" spellcheck="false" placeholder="Enter a public address or transaction hash"><p class="blochai-assistant__note">This reference is sent to the public source for the selected network. Connections do not identify a person or establish ownership.</p></div>
<button class="blochai-assistant__submit" type="submit" disabled>Explore this topic <span aria-hidden="true">→</span></button></form>
<p class="blochai-assistant__status" role="status" aria-live="polite">Choose a topic to begin. This conversation stays in this tab.</p>
<footer class="blochai-assistant__footer"><span>10 requests/min · 60/day per connection. Up to 12 explanations per conversation.</span><span>Public observations only. Source timestamps and coverage limit every explanation.</span><a class="blochai-public-link" href="https://qentl.ai/" rel="noreferrer">About Qentl.ai ↗</a></footer>
</section></div><script src="/blochai-assistant.js?v=${ASSISTANT_ASSET_VERSION}" defer></script>`;
}
