-- Step 8: Security hardening, operational audit fields and retention support.

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

CREATE INDEX IF NOT EXISTS sessions_user_active_idx
  ON sessions(user_id, expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE delivery_locations
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS delivery_locations_retention_idx
  ON delivery_locations(expires_at)
  WHERE expires_at IS NOT NULL;

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS request_id text,
  ADD COLUMN IF NOT EXISTS user_agent text;

CREATE INDEX IF NOT EXISTS audit_logs_request_idx ON audit_logs(request_id);

-- Future scheduled cleanup can safely target records older than the retention policy.
-- Location retention is intentionally explicit rather than silently deleting operational data.
