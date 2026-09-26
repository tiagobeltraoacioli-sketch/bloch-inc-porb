// Reference selection and review eligibility are shared by the private UI tests.
// The server independently enforces every grant and organization boundary.
const DAY = 86400000;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
export function atlasSelection(query) {
  const analysis = query.get('analysis'), node = query.get('node');
  return {analysis: uuid(analysis) ? analysis : null, node: typeof node === 'string' && /^[A-Z]{3,4}:(address|script_hash|transaction):[a-zA-Z0-9]{14,100}$/.test(node) ? node : null,...(uuid(query.get('case'))?{case:query.get('case')}:{})};
}
export function atlasSubject(analysis, node) {
  return analysis && node && analysis.scores.rows.some(row => row.id === node) ? `${analysis.id}:${node}` : null;
}
export function atlasReviews(records, subject, days, now = Date.now()) {
  if (!subject || !Number.isInteger(days) || days < 1 || days > 30) return [];
  return records.filter(record => record.kind === 'review' && ['reviewed', 'resolved'].includes(record.status)
    && record.subject === subject && record.expires_at >= now + days * DAY);
}
export function atlasRecordSummary(records, now = Date.now()) {
  const active = records.filter(record => record.expires_at > now);
  return {active: active.length, open: active.filter(record => record.status === 'open').length,
    reviews: active.filter(record => record.kind === 'review' && ['reviewed', 'resolved'].includes(record.status)).length,
    expiring: active.filter(record => record.expires_at <= now + 7 * DAY).length};
}
export function atlasRecords(records, {query = '', kind = 'all', status = 'all', subject = null} = {}, now = Date.now()) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return records.filter(record => record.expires_at > now && (kind === 'all' || record.kind === kind)
    && (status === 'all' || record.status === status) && (subject === null || record.subject === subject)
    && terms.every(term => [record.subject, record.body, record.purpose, record.lawful_basis, record.source_licence]
      .some(value => String(value).toLowerCase().includes(term))))
    .sort((a, b) => b.updated_at - a.updated_at || b.id.localeCompare(a.id, 'en'));
}
export function atlasLink(analysis, node, caseId) {
  const query = new URLSearchParams();
  if (uuid(analysis)) {query.set('analysis', analysis); if (atlasSelection(new URLSearchParams({node})).node) query.set('node', node);}
  if (uuid(caseId)) query.set('case',caseId);
  return '/atlas.html' + (query.size ? '?' + query : '');
}
