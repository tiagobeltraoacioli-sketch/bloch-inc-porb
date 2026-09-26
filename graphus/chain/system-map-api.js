import {ASSETS,LAYERS,STATUS,CATEGORIES,MODULES,CONNECTIONS,actionLinks} from '../assets/system_modules.js';

// Public capability descriptions only. No account state or private findings.
export function systemMapManifest(){
  return {schema_version:1,registry_version:'2026-09-25.2',source:'https://bloch-graphus.xyz/map',
    availability_semantics:'Implementation description, not continuous source health or an executed analysis.',
    connection_semantics:'Module dependencies, not wallet transfers.',
    assets:ASSETS,layers:LAYERS,statuses:STATUS,categories:CATEGORIES,
    modules:MODULES.map(node=>({...node,links_by_asset:Object.fromEntries(node.assets.map(asset=>[asset,actionLinks(node,asset).map(link=>({...link,href:new URL(link.href,'https://bloch-graphus.xyz/').href}))]))})),
    connections:CONNECTIONS,
    capture:{endpoint:'https://bloch-graphus.xyz/api/chain/network',method:'GET',assets:ASSETS,cursor_parameter:'cursor',
      collection_limits:{pages:8,references:1200,records:4000,bytes:3000000},
      source_reported:true,independent_verification:false,identity_attribution:false,aml_scores:false},
  };
}

// These headers are used only on the two public read endpoints below.
export const PUBLIC_READ_CORS={
  'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS',
  'Access-Control-Allow-Headers':'Accept','Access-Control-Max-Age':'86400',
};
