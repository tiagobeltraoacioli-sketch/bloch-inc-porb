ALTER TABLE atlas_records ADD COLUMN updated_by TEXT;
ALTER TABLE atlas_records ADD COLUMN assignee_id TEXT;
ALTER TABLE atlas_records ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('high','normal','low'));
ALTER TABLE atlas_records ADD COLUMN due_at INTEGER;
UPDATE atlas_records SET updated_by=created_by WHERE revision=1;

CREATE TABLE atlas_record_versions (
  record_id TEXT NOT NULL REFERENCES atlas_records(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  origin TEXT NOT NULL CHECK(origin IN ('migration_baseline','write')),
  snapshot_json TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(record_id,revision)
);
CREATE INDEX atlas_record_versions_expiry ON atlas_record_versions(expires_at);

-- A migration can preserve only the current revision, never reconstruct earlier decisions.
INSERT INTO atlas_record_versions(record_id,revision,origin,snapshot_json,expires_at)
SELECT id,revision,'migration_baseline',json_object(
  'id',id,'kind',kind,'subject',subject,'body',body,'purpose',purpose,'lawful_basis',lawful_basis,'source_licence',source_licence,
  'status',status,'revision',revision,'created_by',created_by,'created_at',created_at,'updated_by',updated_by,'updated_at',updated_at,
  'expires_at',expires_at,'assignee_id',assignee_id,'priority',priority,'due_at',due_at),expires_at FROM atlas_records;

-- Triggers keep the snapshot atomic with the accepted record write and its audit event.
CREATE TRIGGER atlas_record_created AFTER INSERT ON atlas_records BEGIN
  INSERT INTO atlas_record_versions(record_id,revision,origin,snapshot_json,expires_at)
  VALUES(NEW.id,NEW.revision,'write',json_object(
    'id',NEW.id,'kind',NEW.kind,'subject',NEW.subject,'body',NEW.body,'purpose',NEW.purpose,'lawful_basis',NEW.lawful_basis,'source_licence',NEW.source_licence,
    'status',NEW.status,'revision',NEW.revision,'created_by',NEW.created_by,'created_at',NEW.created_at,'updated_by',NEW.updated_by,'updated_at',NEW.updated_at,
    'expires_at',NEW.expires_at,'assignee_id',NEW.assignee_id,'priority',NEW.priority,'due_at',NEW.due_at),NEW.expires_at);
END;
CREATE TRIGGER atlas_record_revised AFTER UPDATE ON atlas_records WHEN NEW.revision<>OLD.revision BEGIN
  INSERT INTO atlas_record_versions(record_id,revision,origin,snapshot_json,expires_at)
  VALUES(NEW.id,NEW.revision,'write',json_object(
    'id',NEW.id,'kind',NEW.kind,'subject',NEW.subject,'body',NEW.body,'purpose',NEW.purpose,'lawful_basis',NEW.lawful_basis,'source_licence',NEW.source_licence,
    'status',NEW.status,'revision',NEW.revision,'created_by',NEW.created_by,'created_at',NEW.created_at,'updated_by',NEW.updated_by,'updated_at',NEW.updated_at,
    'expires_at',NEW.expires_at,'assignee_id',NEW.assignee_id,'priority',NEW.priority,'due_at',NEW.due_at),NEW.expires_at);
END;
