-- The latest official-source evidence is separate from immutable observation scores.
CREATE TABLE analysis_enrichments (
  analysis_id TEXT PRIMARY KEY REFERENCES analyses(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  digest TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
