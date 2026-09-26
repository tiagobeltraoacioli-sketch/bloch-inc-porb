// Deliberately synthetic official-file structure; never a real sanctions designation.
export function ofacFixture(){
  const encode=v=>'"'+String(v).replaceAll('"','""')+'"';
  const row=(id,remarks)=>[String(id),'SYNTHETIC PERSON, NOT REAL',...Array(9).fill('-0-'),remarks].map(encode).join(',');
  const sdn=Array.from({length:1000},(_,i)=>row(i+1,i<100?`Digital Currency Address - ETH 0x${(i+1).toString(16).padStart(40,'0')};`:'-0-')).join('\r\n');
  return {sdn,comments:'"1","Synthetic supplementary remarks. Digital Currency Address - XBT 1BoatSLRHtKNngkdXEeobR76b53LETtpyT;"\r\n'};
}
export function officialFetcher(files=ofacFixture(),inspect=()=>{}){return async (url,options)=>{inspect(url,options);return new Response(url.endsWith('SDN.CSV')?files.sdn:files.comments,{headers:{'last-modified':'Thu, 24 Sep 2026 12:00:00 GMT'}});};}
