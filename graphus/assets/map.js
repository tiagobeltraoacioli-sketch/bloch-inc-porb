const NS = 'http://www.w3.org/2000/svg';
const map = document.getElementById('graphus-map');
const nodeGroup = document.createElementNS(NS, 'g');
const edgeGroup = document.createElementNS(NS, 'g');
const labelGroup = document.createElementNS(NS, 'g');
map.append(labelGroup, edgeGroup, nodeGroup);

const N = (id, title, subtitle, layer, x, y, assets, status, description, evidence, access) =>
  ({id, title, subtitle, layer, x, y, assets, status, description, evidence, access});
const nodes = [
  N('btc-source','Bitcoin blocks','MAINNET / TIP','SOURCE',45,96,['btc'],'running','Public Bitcoin source height is checked. Full block and UTXO history are not ingested.','Block hash, confirmation policy, and source version must be recorded.','Free aggregate health only.'),
  N('eth-source','Ethereum blocks','FINALIZED TAG','SOURCE',45,226,['eth','usdt','usdc'],'running','A public endpoint reports the finalized Ethereum block height and hash.','A second source and receipt reconciliation are needed before live event coverage.','Free aggregate health only.'),
  N('usdt-source','USDT contract','ERC-20 / ETH','SOURCE',45,356,['usdt'],'prototype','The initial USDT identity is the issuer-published Ethereum contract, not the symbol alone.','Pin issuer registry version, contract address, chain ID, and Transfer topic.','Public contract facts; private case findings.'),
  N('usdc-source','USDC contract','ERC-20 / ETH','SOURCE',45,486,['usdc'],'prototype','The initial USDC identity is Circle-issued native USDC on Ethereum mainnet.','Treat wrapped or bridged lookalikes as different assets.','Public contract facts; private case findings.'),
  N('blch-source','Bloch indexer','GENESIS-4 / SAMPLE','SOURCE',45,616,['blch'],'running','A bounded sample of finalized Bloch outputs checks adapter health.','Reconcile indexed block, slot, root, and finality against a trusted node.','Free aggregate health only.'),
  N('official-source','Official lists','OFAC / VERSIONED','SOURCE',45,746,['all'],'running','Official OFAC files are refreshed privately for exact identifier comparison.','An address match is potential evidence; a missing match is not clearance.','Raw lists and matches are restricted.'),

  N('btc-normal','UTXO resolver','OUTPOINT / SPEND','NORMALIZE',290,96,['btc'],'prototype','Offline parser preserves outputs with unknown sender ownership.','Inputs must be resolved to previous outputs before value flow is inferred.','Public chain facts; private attribution.'),
  N('eth-normal','Native ETH parser','SUCCESSFUL RECEIPT','NORMALIZE',290,226,['eth'],'prototype','Offline parser accepts native value only when transaction and successful receipt match a finalized block.','Internal calls and contract creation need separate trace logic.','Public chain facts; private interpretation.'),
  N('usdt-normal','USDT log parser','PINNED TRANSFER','NORMALIZE',290,356,['usdt'],'prototype','Offline parser accepts Transfer logs from the allowlisted Ethereum USDT contract.','Mint/burn and zero-value events are separate types.','Public chain facts; private interpretation.'),
  N('usdc-normal','USDC log parser','PINNED TRANSFER','NORMALIZE',290,486,['usdc'],'prototype','Offline parser accepts Transfer logs from the allowlisted Ethereum USDC contract.','Contract identity and block/receipt/log hashes must match.','Public chain facts; private interpretation.'),
  N('blch-normal','BLCH output parser','EXACT BASE UNITS','NORMALIZE',290,616,['blch'],'prototype','Bloch outputs are normalized with script hash, asset, slot and block reference.','A script hash is not a natural-person identity.','Public chain facts; private interpretation.'),
  N('list-normal','Exact list matcher','IDENTIFIER / SYMBOL','NORMALIZE',290,746,['all'],'prototype','A private exact-identifier prototype compares official OFAC snapshot records.','Network and legal listing status require human verification.','Authorized screening only.'),

  N('manifest','Source manifest','HASH / TIME / RIGHT','DATA',535,96,['all'],'design','Every batch requires source ID, checksum, observed and ingested times, rights, and retention policy.','Never silently blend official lists, allegations, and model inference.','Metadata public only when aggregate.'),
  N('events','Canonical events','CHAIN + ASSET + TX','DATA',535,226,['all'],'design','Versioned facts keep chain, network, asset, transaction, event index, and exact integer amount distinct.','Rollback and duplicate detection are required.','Tenant and purpose policy at query time.'),
  N('asset-registry','Asset registry','ISSUER / CONTRACT','DATA',535,356,['all'],'prototype','Initial scope is BTC, ETH, ERC-20 USDT/USDC on Ethereum, and BLCH.','USDT/USDC contract identity is versioned from issuer sources.','Public asset metadata; no score.'),
  N('quality','Quality ledger','GAPS / REORG / AGE','DATA',535,486,['all'],'design','Coverage, missed blocks, reorgs, stale sources, and decoder failures are first-class data.','Missing data cannot be treated as zero activity.','Aggregate quality public; detailed errors private.'),
  N('private-context','Private context','IP / CUSTOMER DATA','DATA',535,616,['all'],'restricted','Customer-provided IP or identity context stays in a separate purpose-bound store.','A chain transaction has no physical location; IP geolocation can be wrong.','Restricted to lawful tenant workflows.'),
  N('snapshot','Evidence snapshot','REPLAY / EXPIRY','DATA',535,746,['all'],'design','A reproducible case snapshot pins chain facts, source versions, model version, and expiry.','Corrections and reorgs must invalidate dependent findings.','Private case-scoped access.'),

  N('tx-node','Transaction nodes','TIME + STATUS','GRAPH',780,96,['all'],'design','Transactions and events are distinct typed nodes with finality and source lineage.','No person-level attribution from an address alone.','Public facts in free tier.'),
  N('utxo-node','UTXO nodes','BTC + BLCH','GRAPH',780,226,['btc','blch'],'prototype','Outpoint/output nodes preserve spend direction and exact asset units.','Shared-input ownership is a reversible hypothesis only.','Public facts; cluster claims private.'),
  N('account-node','Account nodes','ETH + ERC-20','GRAPH',780,356,['eth','usdt','usdc'],'design','EVM accounts, contracts, and token asset identities are separate graph node types.','An exchange hot wallet or contract is a shared-service confounder.','Public facts; sensitive tags private.'),
  N('asset-node','Asset nodes','FIVE INITIAL ASSETS','GRAPH',780,486,['all'],'prototype','Asset-specific edges prevent ETH, USDT, USDC, BTC, and BLCH values from being conflated.','Fiat conversion needs price source and timestamp.','Asset definitions public.'),
  N('claim-node','Source claims','EXACT / HYPOTHESIS','GRAPH',780,616,['all'],'design','Official exact matches, external tags, allegations, and model hypotheses occupy different evidence types.','A graph neighbor is not a sanctioned entity.','Claims and scores restricted.'),
  N('bridge-node','Bridge proof','CROSS-CHAIN GATE','GRAPH',780,746,['all'],'prototype','A cross-chain value edge requires a verifiable source transaction, message, receipt, and asset map.','Timing alone cannot create a value-flow edge.','Proof metadata may be public; case link private.'),

  N('paths','Temporal paths','DIRECTION / EXPIRY','ANALYZE',1025,96,['all'],'prototype','Bounded path prototype respects direction, event time, finality, expiry, and bridge-proof gates.','Path rank is not a risk probability or guilt claim.','Free simple paths; private case analysis.'),
  N('motifs','Flow motifs','CYCLES / FAN-IN','ANALYZE',1025,226,['all'],'design','Candidate motifs include pass-through, peel patterns, bursts, cycles, and bridge round trips.','Heuristics must report missingness and alternative explanations.','Aggregate/public examples; cases private.'),
  N('features','Feature windows','CHAIN / ASSET / TIME','ANALYZE',1025,356,['all'],'design','Feature definitions carry window, chain, asset, source and transform versions.','No future data or cross-entity label leakage.','Private training and scoring store.'),
  N('ml','Temporal ML','VALIDATION FIRST','ANALYZE',1025,486,['all'],'prototype','Offline gates reject unreviewed labels and entity-overlapping temporal holdouts. No real AML model is trained.','Promotion needs precision, recall, FPR, calibration, drift, and rollback.','Model outputs restricted.'),
  N('zk','ZK proof research','BOUNDED INFERENCE','ANALYZE',1025,616,['all'],'design','Candidate proofs cover a small deterministic feature transform or model inference.','A valid proof does not establish source truth, legal basis, or model accuracy.','Proof metadata may be shared; witness private.'),
  N('geo','Jurisdiction context','CUSTOMER IP ONLY','ANALYZE',1025,746,['all'],'restricted','Optional IP-derived jurisdiction is private context from a lawful customer access event.','VPNs, proxies and geolocation error prevent automatic sanctions conclusions.','Purpose-bound, short-lived tenant access.'),

  N('free','Free explorer','PUBLIC FACTS','DELIVER',1270,126,['all'],'running','The freemium public surface shows product architecture, source health and synthetic examples today. A transaction explorer is a build stage.','No public wallet score or blacklist.','Open, rate-limited future factual views.'),
  N('scores','Private scores','NAMED GRANTS','DELIVER',1270,326,['all'],'restricted','Future scores may be shown only after real validation to named, identity-verified people selected by Bloch Inc.','Role alone is insufficient: tenant, purpose, contract, case and audit are required.','Named, authenticated, case-scoped.'),
  N('review','Human review','DISPUTE / APPEAL','DELIVER',1270,526,['all'],'restricted','Analysts inspect source records, graph paths, uncertainty and alternative interpretations before consequential decisions.','Corrections and expiry must propagate to downstream outputs.','Authorized reviewers only.'),
  N('audit','Audit + deletion','POLICY / RETENTION','DELIVER',1270,726,['all'],'restricted','Access, model, source and case decisions require audit and lifecycle controls.','LGPD/GDPR roles, legal basis, deletion and transfer assessments must be approved.','Security and privacy roles only.'),
];

const E = (from, to) => [from, to];
const edges = [
  E('btc-source','btc-normal'),E('eth-source','eth-normal'),E('usdt-source','usdt-normal'),E('usdc-source','usdc-normal'),E('blch-source','blch-normal'),E('official-source','list-normal'),
  E('btc-normal','events'),E('eth-normal','events'),E('usdt-normal','events'),E('usdc-normal','events'),E('blch-normal','events'),E('list-normal','snapshot'),
  E('btc-source','manifest'),E('eth-source','manifest'),E('usdt-source','asset-registry'),E('usdc-source','asset-registry'),E('blch-source','manifest'),E('official-source','manifest'),
  E('manifest','quality'),E('events','quality'),E('asset-registry','events'),E('quality','snapshot'),E('private-context','snapshot'),
  E('events','tx-node'),E('events','utxo-node'),E('events','account-node'),E('asset-registry','asset-node'),E('snapshot','claim-node'),E('snapshot','bridge-node'),
  E('tx-node','paths'),E('utxo-node','paths'),E('account-node','paths'),E('asset-node','features'),E('claim-node','paths'),E('bridge-node','paths'),
  E('tx-node','motifs'),E('utxo-node','motifs'),E('account-node','motifs'),E('paths','features'),E('motifs','features'),E('features','ml'),E('features','zk'),E('private-context','geo'),
  E('events','free'),E('quality','free'),E('paths','free'),E('ml','scores'),E('claim-node','scores'),E('geo','review'),E('scores','review'),E('review','audit'),E('snapshot','audit'),E('zk','audit'),
];

const byId = new Map(nodes.map(node => [node.id, node]));
const edgeEls = [];
const nodeEls = new Map();
let selected = null;
let asset = 'all';
let query = '';
let zoom = 1;

function svgElement(tag, attrs = {}) {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  return element;
}
function appendText(parent, x, y, value, cssClass) {
  const element = svgElement('text', {x, y, class: cssClass});
  element.textContent = value;
  parent.append(element);
}

for (const [index, label] of ['SOURCE','NORMALIZE','DATA CONTROL','EVIDENCE GRAPH','INTELLIGENCE','ACCESS'].entries())
  appendText(labelGroup, 45 + index * 245, 50, `${String(index + 1).padStart(2,'0')} / ${label}`, 'map-column-label');

for (const [fromId, toId] of edges) {
  const from = byId.get(fromId), to = byId.get(toId);
  const x1 = from.x + 186, y1 = from.y + 30, x2 = to.x, y2 = to.y + 30;
  const path = svgElement('path', {d:`M${x1} ${y1} C${x1 + 45} ${y1},${x2 - 45} ${y2},${x2} ${y2}`, class:'map-link'});
  edgeGroup.append(path);
  edgeEls.push({fromId,toId,path});
}
for (const node of nodes) {
  const group = svgElement('g', {class:`map-node ${node.status}`, tabindex:0, role:'button', 'aria-label':`${node.title}, ${node.status}`});
  group.append(svgElement('rect', {x:node.x,y:node.y,width:186,height:60}));
  group.append(svgElement('circle', {cx:node.x + 12,cy:node.y + 16,r:4}));
  appendText(group,node.x + 22,node.y + 27,node.title,'node-title');
  appendText(group,node.x + 22,node.y + 46,node.subtitle,'node-sub');
  group.addEventListener('click',()=>select(node.id));
  group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();select(node.id);}});
  nodeGroup.append(group);
  nodeEls.set(node.id,group);
}
function isVisible(node) {
  return (asset === 'all' || node.assets.includes('all') || node.assets.includes(asset)) && (!query || `${node.title} ${node.subtitle} ${node.description}`.toLowerCase().includes(query));
}
function refresh() {
  const neighbors = new Set(selected ? [selected] : []);
  if (selected) edges.forEach(([from,to])=>{if(from===selected)neighbors.add(to);if(to===selected)neighbors.add(from);});
  nodes.forEach(node=>{
    const element=nodeEls.get(node.id);
    element.classList.toggle('selected',node.id===selected);
    element.classList.toggle('dimmed',!isVisible(node)||(selected&&!neighbors.has(node.id)));
  });
  edgeEls.forEach(({fromId,toId,path})=>{
    const active = !selected || fromId===selected || toId===selected;
    const visible = isVisible(byId.get(fromId)) && isVisible(byId.get(toId));
    path.classList.toggle('highlight',Boolean(selected&&active&&visible));
    path.classList.toggle('dimmed',!visible||Boolean(selected&&!active));
  });
}
function select(id) {
  selected=id;
  const node=byId.get(id);
  document.getElementById('node-layer').textContent=`${node.layer} / ${node.subtitle}`;
  document.getElementById('node-title').textContent=node.title;
  document.getElementById('node-description').textContent=node.description;
  document.getElementById('node-status').textContent=({running:'Running bounded job or public preview',prototype:'Offline or local prototype',design:'Design gate',restricted:'Restricted future workflow'})[node.status];
  document.getElementById('node-evidence').textContent=node.evidence;
  document.getElementById('node-access').textContent=node.access;
  refresh();
}
document.querySelectorAll('[data-asset]').forEach(button=>button.addEventListener('click',()=>{
  asset=button.dataset.asset;
  document.querySelectorAll('[data-asset]').forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',String(item===button));});
  refresh();
}));
document.getElementById('node-search').addEventListener('input',event=>{query=event.target.value.trim().toLowerCase();selected=null;refresh();});
function setZoom(next){zoom=Math.max(.75,Math.min(1.8,next));const width=1600/zoom,height=940/zoom;map.setAttribute('viewBox',`${(1600-width)/2} ${(940-height)/2} ${width} ${height}`);}
document.getElementById('zoom-out').addEventListener('click',()=>setZoom(zoom-.15));
document.getElementById('zoom-in').addEventListener('click',()=>setZoom(zoom+.15));
document.getElementById('zoom-reset').addEventListener('click',()=>setZoom(1));
refresh();
