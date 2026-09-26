-- Tenant-private notes, processing records, corrections and human review.
CREATE TABLE atlas_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  kind TEXT NOT NULL CHECK(kind IN ('annotation','processing','correction','review')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  purpose TEXT NOT NULL,
  lawful_basis TEXT NOT NULL,
  source_licence TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','reviewed','resolved')),
  revision INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX atlas_records_tenant ON atlas_records(tenant_id, updated_at DESC, id DESC);
CREATE INDEX atlas_records_expiry ON atlas_records(tenant_id, expires_at);

CREATE TABLE atlas_score_grants (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  analysis_id TEXT NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  review_record_id TEXT NOT NULL REFERENCES atlas_records(id) ON DELETE CASCADE,
  named_grantee TEXT NOT NULL,
  purpose TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE INDEX atlas_grants_tenant ON atlas_score_grants(tenant_id, created_at DESC);
