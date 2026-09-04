-- Step 5: Secure prescription workflow and compliance foundation.

CREATE TABLE IF NOT EXISTS prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'PENDING_REVIEW'
    CHECK(status IN ('PENDING_REVIEW','APPROVED','REJECTED','EXPIRED','REVOKED')),
  issued_at timestamptz,
  expires_at timestamptz,
  notes text,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prescriptions_customer_idx ON prescriptions(customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS prescriptions_status_idx ON prescriptions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS prescription_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  storage_key text UNIQUE NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL CHECK(mime_type IN ('image/jpeg','image/png','application/pdf')),
  byte_size bigint NOT NULL CHECK(byte_size > 0),
  sha256 text NOT NULL,
  encrypted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prescription_files_prescription_idx ON prescription_files(prescription_id);

CREATE TABLE IF NOT EXISTS prescription_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  drug_product_id uuid REFERENCES drug_products(id) ON DELETE SET NULL,
  medicine_name_snapshot text NOT NULL,
  dosage_instructions text,
  quantity integer CHECK(quantity IS NULL OR quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prescription_items_prescription_idx ON prescription_items(prescription_id);
CREATE INDEX IF NOT EXISTS prescription_items_product_idx ON prescription_items(drug_product_id);

CREATE TABLE IF NOT EXISTS prescription_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  reviewer_user_id uuid NOT NULL REFERENCES users(id),
  decision text NOT NULL CHECK(decision IN ('APPROVED','REJECTED')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prescription_reviews_prescription_idx ON prescription_reviews(prescription_id, created_at DESC);

CREATE TABLE IF NOT EXISTS prescription_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prescription_access_logs_prescription_idx ON prescription_access_logs(prescription_id, created_at DESC);

-- Attach an optional approved prescription to an order; the backend enforces ownership/status.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS prescription_id uuid REFERENCES prescriptions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS orders_prescription_idx ON orders(prescription_id);

INSERT INTO permissions(name, description) VALUES
  ('prescription:create:self', 'Create a prescription record for the authenticated customer'),
  ('prescription:read:self', 'Read own prescription metadata'),
  ('prescription:upload:self', 'Upload a prescription file to own prescription'),
  ('prescription:access:self', 'Access own prescription file'),
  ('prescription:review', 'Review customer prescriptions'),
  ('prescription:admin', 'Manage prescription compliance controls')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name='CUSTOMER' AND p.name IN (
  'prescription:create:self','prescription:read:self','prescription:upload:self','prescription:access:self'
) ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name='ADMIN' AND p.name IN ('prescription:review','prescription:admin')
ON CONFLICT DO NOTHING;
