const examples = {
  flow: {
    kicker: "FINALIZED EVENT · SOURCE ID · EXPIRY",
    title: "Trace a path, retain the caveat.",
    body: "A bounded, directed path can help prioritize review. The path is an association with source references and time limits; it is never a verdict about a person or wallet.",
    tag: "Association only · Human review required"
  },
  source: {
    kicker: "OFFICIAL RECORD · SNAPSHOT · RIGHT TO USE",
    title: "Make every claim inspectable.",
    body: "A source record carries its origin, retrieval time, identifier scope, confidence, and expiry. An exact listed identifier is a potential match for verification, not automatic clearance or enforcement.",
    tag: "Exact identifier · Network verification required"
  },
  proof: {
    kicker: "COMMITTED INPUT · PINNED PROGRAM · VERIFIED OUTPUT",
    title: "Prove a calculation, not a conclusion.",
    body: "The ZK research target is a small deterministic transform or inference. A valid proof can support computation integrity; it cannot prove that the input source is true or that a model is accurate.",
    tag: "Research design · No prover deployed"
  }
};

const tabs = Array.from(document.querySelectorAll('[role="tab"]'));
const panel = document.getElementById('panel-example');
function selectTab(tab) {
  const item = examples[tab.dataset.example];
  if (!item) return;
  tabs.forEach(button => button.setAttribute('aria-selected', String(button === tab)));
  panel.setAttribute('aria-labelledby', tab.id);
  document.getElementById('example-kicker').textContent = item.kicker;
  document.getElementById('example-title').textContent = item.title;
  document.getElementById('example-body').textContent = item.body;
  document.getElementById('example-tag').textContent = item.tag;
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', event => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    next.focus();
    selectTab(next);
  });
});

const chainData = {
  btc: {
    family: 'UTXO / PROBABILISTIC FINALITY', title: 'Bitcoin flow map',
    input: 'Block + transaction', normalize: 'Outpoint + spend', graph: 'UTXO flow graph', analysis: 'Temporal motifs',
    detail: 'Inputs spend earlier outputs; multiple inputs do not establish a single owner. Change and CoinJoin heuristics remain reversible hypotheses.',
    boundary: 'Boundary: Bitcoin tip height is observed; confirmation policy and full UTXO reconstruction are future gates.'
  },
  eth: {
    family: 'ACCOUNT + CONTRACT / FINALIZED BLOCK', title: 'Ethereum execution map',
    input: 'Block + receipt + log', normalize: 'Native / token / call', graph: 'Account-contract graph', analysis: 'Contract flow context',
    detail: 'Native value, ERC-20 transfer logs, contract calls, and traces are distinct facts. A contract or exchange address may represent many users.',
    boundary: 'Boundary: finalized height is observed; receipts, traces, and full transaction ingestion are future gates.'
  },
  usdt: {
    family: 'ETHEREUM MAINNET / ERC-20 CONTRACT', title: 'USDT transfer event map',
    input: 'Successful receipt log', normalize: 'Pinned contract + Transfer', graph: 'USDT asset-flow graph', analysis: 'Stablecoin motifs',
    detail: 'Only the issuer-published Ethereum contract and a correctly encoded Transfer event identify this asset. Mint and burn need separate event types.',
    boundary: 'Boundary: an offline allowlisted parser exists; token logs are not yet ingested from a live source.'
  },
  usdc: {
    family: 'ETHEREUM MAINNET / ERC-20 CONTRACT', title: 'USDC transfer event map',
    input: 'Successful receipt log', normalize: 'Pinned contract + Transfer', graph: 'USDC asset-flow graph', analysis: 'Stablecoin motifs',
    detail: 'The Circle-published Ethereum contract defines native USDC on this network. A similarly named wrapped or bridged token is a different asset.',
    boundary: 'Boundary: an offline allowlisted parser exists; token logs are not yet ingested from a live source.'
  },
  blch: {
    family: 'EUTXO / FINALIZED INDEXER', title: 'Bloch output map',
    input: 'Finalized transaction', normalize: 'Input + output + asset', graph: 'Script-output graph', analysis: 'Value-flow motifs',
    detail: 'Script hashes, outputs, exact asset units, slot, and block lineage are tracked separately. A script hash does not identify a person.',
    boundary: 'Boundary: five-transaction indexer samples exist; full input resolution and reorg replay are future gates.'
  }
};
const chainTabs = Array.from(document.querySelectorAll('[data-chain]'));
const chainPanel = document.getElementById('chain-panel');
function selectChain(tab) {
  const item = chainData[tab.dataset.chain];
  if (!item) return;
  chainTabs.forEach(button => button.setAttribute('aria-selected', String(button === tab)));
  chainPanel.setAttribute('aria-labelledby', tab.id);
  for (const [field, target] of Object.entries({
    family: 'chain-family', title: 'chain-title', input: 'map-input', normalize: 'map-normalize',
    graph: 'map-graph', analysis: 'map-analysis', detail: 'chain-detail', boundary: 'chain-boundary'
  })) document.getElementById(target).textContent = item[field];
}
chainTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectChain(tab));
  tab.addEventListener('keydown', event => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = chainTabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + chainTabs.length) % chainTabs.length];
    next.focus();
    selectChain(next);
  });
});
