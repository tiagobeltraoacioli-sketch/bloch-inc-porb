-- Tenant-private reference index and evidence workflows. No ownership labels.
CREATE TABLE analysis_references (
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  reference TEXT NOT NULL,
  node_id TEXT NOT NULL,
  score_json TEXT NOT NULL,
  PRIMARY KEY (analysis_id, reference)
);
CREATE INDEX reference_lookup ON analysis_references(reference, analysis_id);
ALTER TABLE analyses ADD COLUMN indexed_at INTEGER;

CREATE TABLE cases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX cases_by_tenant ON cases(tenant_id, created_at DESC, id DESC);
CREATE TABLE case_evidence (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  analysis_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  digest TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(case_id, analysis_id, node_id)
);
CREATE TABLE watch_entries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  asset TEXT NOT NULL,
  reference TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(tenant_id, asset, reference)
);
CREATE INDEX watches_by_tenant ON watch_entries(tenant_id, created_at DESC, id DESC);
CREATE TABLE observation_events (
  id TEXT PRIMARY KEY,
  watch_id TEXT NOT NULL REFERENCES watch_entries(id) ON DELETE CASCADE,
  analysis_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  reviewed_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(watch_id, analysis_id)
);
CREATE INDEX events_by_watch ON observation_events(watch_id, created_at DESC, id DESC);
