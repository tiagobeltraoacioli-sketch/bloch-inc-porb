-- Links retain only attachment identity after report expiry or deletion.
-- The report payload and its governance declarations keep their own retention.
CREATE TABLE atlas_case_reports (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  report_id TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(case_id,report_id)
);
CREATE INDEX atlas_case_reports_case ON atlas_case_reports(case_id,created_at,id);
