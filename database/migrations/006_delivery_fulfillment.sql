-- Step 7: Delivery Management & Order Fulfillment/Tracking
-- No pharmacy/inventory implementation is introduced here. Delivery starts only
-- after an order is confirmed/paid (or is a COD order).

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'PENDING_FULFILLMENT';

CREATE INDEX IF NOT EXISTS orders_fulfillment_status_idx ON orders(fulfillment_status, created_at DESC);

CREATE TABLE IF NOT EXISTS delivery_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE','SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tracking_number text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'PENDING_ASSIGNMENT' CHECK(status IN (
    'PENDING_ASSIGNMENT','ASSIGNED','PICKUP_READY','PICKED_UP','OUT_FOR_DELIVERY','DELIVERED','FAILED','CANCELLED'
  )),
  assigned_agent_id uuid REFERENCES delivery_agents(id) ON DELETE SET NULL,
  pickup_name text,
  pickup_phone text,
  pickup_address text,
  delivery_name text NOT NULL,
  delivery_phone text NOT NULL,
  delivery_address text NOT NULL,
  delivery_city text NOT NULL,
  delivery_postal_code text NOT NULL,
  estimated_delivery_at timestamptz,
  delivered_at timestamptz,
  failure_reason text,
  proof_object_key text,
  proof_sha256 text,
  proof_uploaded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_orders_agent_idx ON delivery_orders(assigned_agent_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS delivery_orders_status_idx ON delivery_orders(status, created_at DESC);
CREATE INDEX IF NOT EXISTS delivery_orders_tracking_idx ON delivery_orders(tracking_number);

CREATE TABLE IF NOT EXISTS delivery_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_order_id uuid NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
  status text NOT NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'SYSTEM' CHECK(source IN ('SYSTEM','ADMIN','DELIVERY_AGENT','CUSTOMER')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_events_timeline_idx ON delivery_events(delivery_order_id, created_at ASC);

CREATE TABLE IF NOT EXISTS delivery_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_order_id uuid NOT NULL REFERENCES delivery_orders(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES delivery_agents(id) ON DELETE SET NULL,
  latitude numeric(9,6) NOT NULL CHECK(latitude BETWEEN -90 AND 90),
  longitude numeric(9,6) NOT NULL CHECK(longitude BETWEEN -180 AND 180),
  accuracy_m numeric(10,2),
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS delivery_locations_latest_idx ON delivery_locations(delivery_order_id, recorded_at DESC);

INSERT INTO permissions(name, description) VALUES
  ('delivery:read:self', 'Read own assigned delivery tasks'),
  ('delivery:update:self', 'Update own assigned delivery status'),
  ('delivery:location:self', 'Record own delivery location'),
  ('delivery:read:customer', 'Read delivery tracking for own customer orders'),
  ('admin:delivery:read', 'Read delivery operations'),
  ('admin:delivery:create', 'Create delivery tasks for confirmed orders'),
  ('admin:delivery:assign', 'Assign delivery tasks to delivery agents'),
  ('admin:delivery:update', 'Update delivery operations'),
  ('admin:delivery:read-agents', 'Read delivery agents')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name='CUSTOMER' AND p.name='delivery:read:customer'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name='DELIVERY_AGENT' AND p.name IN ('delivery:read:self','delivery:update:self','delivery:location:self')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.name='ADMIN' AND p.name IN ('admin:delivery:read','admin:delivery:create','admin:delivery:assign','admin:delivery:update','admin:delivery:read-agents')
ON CONFLICT DO NOTHING;
