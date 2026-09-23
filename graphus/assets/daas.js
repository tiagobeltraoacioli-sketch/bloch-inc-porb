const status=document.getElementById('daas-status');
fetch('/api/daas/manifest').then(async response=>{
  if(!response.ok)throw new Error('manifest_unavailable');
  const manifest=await response.json();
  status.textContent=`API manifest: ${manifest.status} · ${manifest.initial_assets.length} initial assets · no live transaction feed`;
}).catch(()=>{status.textContent='API manifest is not available in this local preview.';});
