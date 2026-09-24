CREATE TABLE IF NOT EXISTS space_accounts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  recovery_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS space_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES space_accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS space_sessions_account ON space_sessions(account_id);
CREATE TABLE IF NOT EXISTS space_auth_budget (
  bucket TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS space_workspace (
  account_id TEXT PRIMARY KEY REFERENCES space_accounts(id) ON DELETE CASCADE,
  config_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
