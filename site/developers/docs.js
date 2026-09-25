const $=id=>document.getElementById(id),base=location.origin+'/api/porb';
$('base-url').textContent=base;
$('quickstart-code').textContent=`export PORB_BASE='${base}'
# Set PORB_API_KEY from your server's secret store.
curl --fail-with-body --max-time 120 "$PORB_BASE/v1/analyses" \\
  -H "Authorization: Bearer $PORB_API_KEY" \\
  -H 'Content-Type: application/json' \\
  --data '{"asset":"ETH","pages":2}'

# Required scopes: data:read, analyses:write, scores:read
# Read recent runs: analyses:read, scores:read
curl --fail-with-body "$PORB_BASE/v1/analyses" \\
  -H "Authorization: Bearer $PORB_API_KEY"`;
$('python-code').textContent=`import json, os, urllib.request
base = os.environ.get("PORB_BASE", "${base}")
request = urllib.request.Request(
    base + "/v1/analyses",
    headers={"Authorization": "Bearer " + os.environ["PORB_API_KEY"]},
)
with urllib.request.urlopen(request, timeout=120) as response:
    runs = json.load(response)
    print(runs["analyses"])
# Exact amounts: int(record["amount_base_units"])`;
$('js-code').textContent=`const base = process.env.PORB_BASE || '${base}';
const response = await fetch(base + '/v1/analyses', {
  headers: { Authorization: 'Bearer ' + process.env.PORB_API_KEY },
  signal: AbortSignal.timeout(120000),
});
const data = await response.json();
if (!response.ok) throw new Error(data.error);
console.log(data.analyses);
// Exact amounts: BigInt(record.amount_base_units)`;
function el(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
let contract;
function render(){const filter=$('endpoint-search').value.toLowerCase(),box=$('endpoints');box.replaceChildren();let count=0;
  for(const [path,methods] of Object.entries(contract.paths))for(const [method,op] of Object.entries(methods)){
    if(!`${path} ${op.summary} ${op.tags}`.toLowerCase().includes(filter))continue;count++;
    const item=el('details');item.className='panel endpoint';const summary=el('summary'),verb=el('strong',method.toUpperCase());verb.className='method';summary.append(verb,el('code',path),el('span',op.summary));item.append(summary,el('p',op.description),el('p','Required scopes: '+op['x-required-scopes'].join(' + ')));
    if(op.parameters.length){const pre=el('pre',op.parameters.map(p=>`${p.in} · ${p.name}${p.required?' (required)':''} · ${p.schema.type}${p.schema.enum?' · '+p.schema.enum.join(', '):''}${p.schema.description?' · '+p.schema.description:''}`).join('\n'));item.append(el('h3','Parameters'),pre);}
    if(op.requestBody)item.append(el('h3','JSON request schema'),el('pre',JSON.stringify(op.requestBody.content['application/json'].schema,null,2)));
    item.append(el('p','Response: application/json · '+Object.keys(op.responses).join(', ')));box.append(item);
  }$('docs-status').textContent=`${count} implemented operations. Download OpenAPI for the machine-readable contract.`;
}
try{const r=await fetch('/developers/openapi.json');if(!r.ok)throw new Error('Contract unavailable');contract=await r.json();render();$('endpoint-search').oninput=render;}catch{$('docs-status').textContent='The API contract could not be loaded. Reload or download OpenAPI directly.';}
