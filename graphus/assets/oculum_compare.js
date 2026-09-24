(function(root){
  'use strict';
  function compareSourceBalances(a,b){
    const defaults={BTC:8,ETH:18,USDT:6,USDC:6,BLCH:8};
    const aDecimals=a?.decimals??defaults[a?.asset],bDecimals=b?.decimals??defaults[b?.asset];
    if(!a||!b||a.key===b.key||a.asset!==b.asset||a.network!==b.network
      ||!/^[0-9]+$/.test(a.baseUnits)||!/^[0-9]+$/.test(b.baseUnits)
      ||!Number.isInteger(aDecimals)||aDecimals<0||aDecimals>36||aDecimals!==bDecimals)
      throw new Error('incompatible_balance_records');
    if((a.contract||'').toLowerCase()!==(b.contract||'').toLowerCase())
      throw new Error('different_token_contracts');
    const left=BigInt(a.baseUnits),right=BigInt(b.baseUnits);
    const leftHash=a.block?.hash||null,rightHash=b.block?.hash||null;
    const anchor=leftHash&&rightHash?(leftHash===rightHash?'same_block':'different_blocks'):'not_shared';
    return {
      asset:a.asset,network:a.network,decimals:aDecimals,
      differenceBaseUnits:(left>=right?left-right:right-left).toString(),
      larger:left===right?'equal':left>right?'a':'b',
      anchor,sourceMatch:a.source===b.source,
      sameSnapshot:anchor==='same_block'&&a.source===b.source,
    };
  }
  const api={compareSourceBalances};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.GraphusOculumCompare=api;
})(typeof window!=='undefined'?window:globalThis);
