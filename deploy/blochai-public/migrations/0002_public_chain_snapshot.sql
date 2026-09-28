-- Only normalized PUBLIC chain observations and references. No private prompts or results.
ALTER TABLE blochai_public_jobs ADD COLUMN guide_json TEXT;
