-- Step 6: Payment & Transaction Processing
-- Provider-agnostic payment ledger with SSLCOMMERZ adapter support.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS payment_provider text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_payment_status_idx ON orders(payment_status, created_at DESC);

CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_tran_id text NOT NULL,
  provider_session_id text,
  amount_bdt numeric(12,2) NOT NULL CHECK(amount_bdt >= 0),
  currency char(3) NOT NULL DEFAULT 'BDT',
  status text NOT NULL CHECK(status IN ('PENDING','INITIATED','AUTHORIZED','PAID','FAILED','CANCELLED','REFUNDED','PARTIALLY_REFUNDED')),
  provider_validation_id text,
  provider_bank_tran_id text,
  provider_payment_method text,
  risk_level integer,
  risk_title text,
  failure_code text,
  failure_message text,
  initiated_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_tran_id)
);
CREATE INDEX IF NOT EXISTS payment_transactions_order_idx ON payment_transactions(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_transactions_status_idx ON payment_transactions(status, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_transactions_validation_idx ON payment_transactions(provider, provider_validation_id);

CREATE TABLE IF NOT EXISTS payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_transaction_id uuid REFERENCES payment_transactions(id) ON DELETE SET NULL,
  provider text NOT NULL,
  event_type text NOT NULL,
  provider_event_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_event_id)
);
CREATE INDEX IF NOT EXISTS payment_events_received_idx ON payment_events(received_at DESC);

CREATE TABLE IF NOT EXISTS refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_transaction_id uuid NOT NULL REFERENCES payment_transactions(id),
  order_id uuid NOT NULL REFERENCES orders(id),
  amount_bdt numeric(12,2) NOT NULL CHECK(amount_bdt > 0),
  currency char(3) NOT NULL DEFAULT 'BDT',
  status text NOT NULL CHECK(status IN ('PENDING','PROCESSING','REFUNDED','FAILED','CANCELLED')) DEFAULT 'PENDING',
  provider_refund_id text,
  reason text,
  failure_message text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refunds_order_idx ON refunds(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS refunds_payment_idx ON refunds(payment_transaction_id, created_at DESC);

INSERT INTO permissions(name, description) VALUES
  ('payment:read:self', 'Read own payment status and transactions'),
  ('payment:initiate:self', 'Initiate payment for own pending order'),
  ('admin:payment:refund', 'Initiate refunds for customer payments')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name='CUSTOMER' AND p.name IN ('payment:read:self','payment:initiate:self')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name='ADMIN' AND p.name IN ('admin:payment:refund','payment:read:self')
ON CONFLICT DO NOTHING;
