-- Preserve all existing immutable reports and payloads while adding window comparisons.
-- D1 applies this migration atomically; copied parts reference the copied parent.
CREATE TABLE atlas_reports_next (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  request_id TEXT NOT NULL,
  request_digest TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('paths','comparison','motifs','timeline','window_comparison')),
  title TEXT NOT NULL,
  purpose TEXT NOT NULL,
  lawful_basis TEXT NOT NULL,
  source_licence TEXT NOT NULL,
  asset TEXT NOT NULL,
  report_version TEXT NOT NULL,
  report_sha256 TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  parameters_json TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  payload_bytes INTEGER NOT NULL CHECK(payload_bytes BETWEEN 1 AND 6000000),
  part_count INTEGER NOT NULL CHECK(part_count BETWEEN 1 AND 30),
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  UNIQUE(tenant_id,request_id)
);
INSERT INTO atlas_reports_next SELECT * FROM atlas_reports;
CREATE TABLE atlas_report_parts_next (
  report_id TEXT NOT NULL REFERENCES atlas_reports_next(id) ON DELETE CASCADE,
  part INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY(report_id,part)
);
INSERT INTO atlas_report_parts_next SELECT * FROM atlas_report_parts;
DROP TABLE atlas_report_parts;
DROP TABLE atlas_reports;
ALTER TABLE atlas_reports_next RENAME TO atlas_reports;
ALTER TABLE atlas_report_parts_next RENAME TO atlas_report_parts;
CREATE INDEX atlas_reports_tenant ON atlas_reports(tenant_id,created_at DESC,id DESC);
CREATE INDEX atlas_reports_expiry ON atlas_reports(tenant_id,expires_at);
