import {researchRetrySeconds} from '../public/assets/address-research-request.js';

const METHODS=new Set(['eth_chainId','eth_getBlockByNumber','eth_getBalance','eth_call','eth_getLogs']);
// Operational diagnostics contain no URL, reference, RPC parameters or response body.
export function researchSourceFetch(fetcher,{signal,network,asset,observe=()=>{}}){
  const emit=record=>{try{observe({network,asset,...record});}catch{/* Diagnostics cannot change a source result. */}};
  return async(input,init={})=>{
    const started=Date.now();let operation='http_read';
    try{const method=JSON.parse(init.body).method;if(METHODS.has(method))operation=method;}catch{}
    const combined=init.signal?AbortSignal.any([signal,init.signal]):signal;
    try{
      const response=await fetcher(input,{...init,signal:combined});
      if(!response.ok){
        emit({operation,failure:'http',status:response.status,retry_after_seconds:researchRetrySeconds(response.headers,response.status),elapsed_ms:Date.now()-started});
        await response.body?.cancel().catch(()=>{});
      }
      return response;
    }catch(error){
      emit({operation,failure:combined.aborted?'deadline_or_abort':'transport',status:null,elapsed_ms:Date.now()-started});
      throw error;
    }
  };
}
