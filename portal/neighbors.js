// A separate unsupervised baseline; it does not replace or recalibrate Red.
export const NEIGHBOR_CARD = {
  version:'porb-neighbors-1.0.0',algorithm:'k-nearest-neighbor mean Euclidean distance',neighbors:10,minimum_references:20,
  scaling:'Population standard deviation within the current asset cohort; constant features are excluded.',
  percentile:'Midrank of mean distances within this sample, 0–100. Tied distances share a percentile.',
  interpretation:'Descriptive neighborhood sparsity, not a probability, risk class or validated AML detector. Nearest references are feature neighbors, not asserted transaction counterparties.',
};
export function neighborBaseline(rows,features) {
  const absent = reason => ({available:false,reason,model:NEIGHBOR_CARD,rows:[]});
  if (rows.length < 20) return absent('At least 20 observed references are required.');
  if (rows.length > 1200 || rows.some(r => features.some(f => !Number.isFinite(r.features[f])))) throw new Error('invalid_neighbor_cohort');
  const ordered = rows.slice().sort((a,b) => a.id.localeCompare(b.id,'en'));
  if (new Set(ordered.map(r => JSON.stringify(features.map(f => r.features[f])))).size < 3) return absent('At least three distinct feature vectors are required.');
  const scales = features.map(feature => {
    const mean = ordered.reduce((s,r) => s+r.features[feature],0)/ordered.length;
    const sd = Math.sqrt(ordered.reduce((s,r) => s+(r.features[feature]-mean)**2,0)/ordered.length);
    return {feature,mean,standard_deviation:sd > 1e-12*Math.max(1,Math.abs(mean)) ? sd : 0};
  });
  const active = scales.filter(s => s.standard_deviation);
  if (!active.length) return absent('The cohort has no varying features.');
  const vectors = ordered.map(r => active.map(s => (r.features[s.feature]-s.mean)/s.standard_deviation));
  const k = Math.min(NEIGHBOR_CARD.neighbors,ordered.length-1);
  const result = ordered.map((row,i) => {
    const nearest = vectors.map((v,j) => ({id:ordered[j].id,distance:j === i ? Infinity : Math.sqrt(v.reduce((s,x,f) => s+(x-vectors[i][f])**2,0))})).filter(n => n.id !== row.id)
      .sort((a,b) => a.distance-b.distance || a.id.localeCompare(b.id,'en')).slice(0,k);
    return {id:row.id,mean_distance:nearest.reduce((s,n) => s+n.distance,0)/k,nearest:nearest.slice(0,3)};
  });
  for (const row of result) {
    const below = result.filter(r => r.mean_distance < row.mean_distance).length, tied = result.filter(r => r.mean_distance === row.mean_distance).length;
    row.percentile = 100*(below+(tied-1)/2)/(result.length-1);
  }
  return {available:true,model:NEIGHBOR_CARD,cohort_size:rows.length,k,scaling:scales,rows:result};
}
