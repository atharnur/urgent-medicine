-- Step 2: Authentication, verification, RBAC and security-event persistence.

CREATE TABLE IF NOT EXISTS permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

INSERT INTO permissions(name, description) VALUES
  ('customer:read:self', 'Read own customer profile and account data'),
  ('customer:update:self', 'Update own customer profile'),
  ('order:create:self', 'Create orders for the authenticated customer'),
  ('order:read:self', 'Read orders owned by the authenticated customer'),
  ('cart:read:self', 'Read the authenticated customer cart'),
  ('cart:write:self', 'Modify the authenticated customer cart'),
  ('address:read:self', 'Read own addresses'),
  ('address:write:self', 'Create/update own addresses'),
  ('admin:access', 'Access administrative functions')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name='CUSTOMER' AND p.name IN (
  'customer:read:self','customer:update:self','order:create:self','order:read:self',
  'cart:read:self','cart:write:self','address:read:self','address:write:self'
) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name='ADMIN' AND p.name='admin:access' ON CONFLICT DO NOTHING;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

CREATE TABLE IF NOT EXISTS verification_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK(channel IN ('EMAIL','PHONE')),
  purpose text NOT NULL CHECK(purpose IN ('SIGNUP','VERIFY_CONTACT')),
  destination text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS verification_challenges_lookup_idx
  ON verification_challenges(user_id, channel, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS verification_challenges_active_idx
  ON verification_challenges(id, expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS password_reset_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_active_idx
  ON password_reset_challenges(id, expires_at) WHERE consumed_at IS NULL;

CREATE TABLE IF NOT EXISTS login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier_hash text NOT NULL,
  ip_hash text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  successful boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_identifier_idx ON login_attempts(identifier_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS login_attempts_ip_idx ON login_attempts(ip_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  request_id text,
  ip_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs(actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs(action, created_at DESC);

CREATE TABLE IF NOT EXISTS security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  severity text NOT NULL DEFAULT 'INFO' CHECK(severity IN ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  request_id text,
  ip_hash text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_events_type_idx ON security_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS security_events_user_idx ON security_events(user_id, created_at DESC);

-- Remove expired authentication material without requiring an external scheduler.
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz;
