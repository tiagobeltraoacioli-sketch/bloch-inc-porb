-- Public usage metadata only. Never bind a private portal database here.
CREATE TABLE IF NOT EXISTS blochai_public_budget (
  bucket TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS blochai_public_budget_expiry ON blochai_public_budget(expires_at);
CREATE TABLE IF NOT EXISTS blochai_public_jobs (
  task_id TEXT PRIMARY KEY,
  portal TEXT NOT NULL CHECK (portal IN ('graphus','space','explorer')),
  ticket_digest TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS blochai_public_jobs_expiry ON blochai_public_jobs(expires_at);
