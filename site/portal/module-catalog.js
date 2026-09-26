// One inventory for the public directory and the authenticated workspace.
export const MODULES=[
  {id:'map',name:'System Map',group:'Graphus',path:'/graphus/map.html',public_url:'https://bloch-graphus.xyz/map.html',description:'Navigate the source registry, network evidence and implementation states.'},
  {id:'constellation',name:'Constellation',group:'Graphus',path:'/graphus/constellation.html',public_url:'https://bloch-graphus.xyz/constellation.html',description:'Explore bounded network graphs, references, recorded flows and provenance.'},
  {id:'oculum',name:'Oculum',group:'Graphus',path:'/graphus/oculum.html',public_url:'https://bloch-graphus.xyz/oculum.html',description:'Inspect recorded balances, holders and exact public-chain observations.'},
  {id:'analytics',name:'Graph analytics',group:'Graphus',path:'/graphus/analytics.html',public_url:'https://bloch-graphus.xyz/analytics.html',description:'Compare graph structure, components and distributions with source coverage.'},
  {id:'app',name:'Research app',group:'Graphus',path:'/graphus/app.html',public_url:'https://bloch-graphus.xyz/app.html',description:'Move between network, wallet and transaction evidence in one research flow.'},
  {id:'catalog',name:'Data Atlas',group:'Graphus',path:'/graphus/catalog.html',public_url:'https://bloch-graphus.xyz/catalog.html',description:'Query the field registry, descriptive statistics, timelines, paths and observed patterns.'},
  {id:'daas',name:'Data services',group:'Graphus',path:'/graphus/daas.html',public_url:'https://bloch-graphus.xyz/daas.html',description:'Inspect datasets, source contracts, supported capabilities and declared limitations.'},
  {id:'space',name:'Multichain workspace',group:'Bloch Space',path:'/space/app/',public_url:'https://bloch.space/app/',description:'Bitcoin, Ethereum and Bloch activity, economics, validators, forecasting, data science, ML and network comparisons.'},
  {id:'graph',name:'Graph Lab',group:'Bloch Space',path:'/space/graph/',public_url:'https://bloch.space/graph/',description:'Expand evidence, inspect paths and components, filter time, and export JSON, CSV, GraphML or PNG.'},
  {id:'explorer',name:'Record explorer',group:'Bloch Space',path:'/space/?network=bloch',public_url:'https://bloch.space/?network=bloch',description:'Inspect blocks, transactions, addresses and indexed script history with exact source records.'},
  {id:'aml',name:'AML research preview',group:'Private research',path:'/aml/',public_url:null,description:'Authenticated synthetic charts, illustrative review states and methodology. Real descriptive scores are in Data & scores.'},
];
export function moduleUrl(id,origin,asset,address){
  const item=MODULES.find(item=>item.id===id);if(!item)return null;
  const url=new URL(item.path,origin),symbol=asset?.toUpperCase(),network={BTC:'bitcoin',ETH:'ethereum',USDT:'ethereum',USDC:'ethereum',BLCH:'bloch'}[symbol];
  if(item.group==='Graphus'){if(symbol)url.searchParams.set('asset',symbol.toLowerCase());if(address)url.searchParams.set('address',address);}
  if(id==='space'&&network)url.searchParams.set('network',network);
  if(id==='graph'&&network){url.searchParams.set('asset',symbol);if(address){url.searchParams.set('kind','address');url.searchParams.set('query',address);}}
  if(id==='explorer'&&network){url.searchParams.set('network',network);if(address){url.searchParams.set('kind','address');url.searchParams.set('query',address);url.searchParams.set('asset',symbol);}}
  return url;
}
