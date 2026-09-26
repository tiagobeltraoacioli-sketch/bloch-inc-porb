// Read-only live source verification. Emit aggregate metadata, never listed identifiers.
import {officialSnapshot} from '../portal/ofac.js';
const started=performance.now(),snapshot=await officialSnapshot();
console.log(JSON.stringify({source:snapshot.source_id,retrieved_at:snapshot.retrieved_at,expires_at:snapshot.expires_at,
  digest:snapshot.digest,files:snapshot.files,rows:snapshot.row_counts,identifiers:snapshot.records.length,
  symbols:[...new Set(snapshot.records.map(r=>r.symbol))].sort(),elapsed_ms:Math.round(performance.now()-started)},null,2));
