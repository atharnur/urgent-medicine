CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE NOT NULL);
INSERT INTO roles(name) VALUES ('CUSTOMER'),('ADMIN'),('PHARMACY'),('DELIVERY_AGENT') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 role_id uuid NOT NULL REFERENCES roles(id),
 name text NOT NULL,
 email text UNIQUE NOT NULL,
 phone text UNIQUE NOT NULL,
 password_hash text NOT NULL,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','LOCKED','DISABLED','PENDING_VERIFICATION')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users(lower(email));

CREATE TABLE IF NOT EXISTS sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash text UNIQUE NOT NULL,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_lookup_idx ON sessions(token_hash,expires_at);

CREATE TABLE IF NOT EXISTS customer_addresses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 label text NOT NULL,
 line1 text NOT NULL,
 city text NOT NULL,
 postal_code text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS manufacturers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text UNIQUE NOT NULL,
 regulatory_identifier text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ingredients (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS drug_products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 dar_identifier text UNIQUE,
 trade_name text NOT NULL,
 generic_name text NOT NULL,
 manufacturer text NOT NULL,
 strength text,
 dosage_form text,
 pack_size text,
 indication text,
 prescription_required boolean NOT NULL DEFAULT false,
 status text NOT NULL DEFAULT 'ACTIVE',
 base_price_bdt numeric(12,2) NOT NULL DEFAULT 0,
 search_document text GENERATED ALWAYS AS (
   lower(coalesce(trade_name,'')||' '||coalesce(generic_name,'')||' '||coalesce(manufacturer,'')||' '||coalesce(strength,'')||' '||coalesce(dosage_form,''))
 ) STORED,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drug_products_search_idx ON drug_products USING gin (to_tsvector('simple', search_document));
CREATE INDEX IF NOT EXISTS drug_products_trade_idx ON drug_products(lower(trade_name));
CREATE INDEX IF NOT EXISTS drug_products_generic_idx ON drug_products(lower(generic_name));

CREATE TABLE IF NOT EXISTS cart_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 product_id uuid NOT NULL REFERENCES drug_products(id),
 quantity integer NOT NULL CHECK(quantity>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,product_id)
);

CREATE TABLE IF NOT EXISTS orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id),
 address_id uuid NOT NULL REFERENCES customer_addresses(id),
 subtotal_bdt numeric(12,2) NOT NULL,
 delivery_charge_bdt numeric(12,2) NOT NULL,
 total_bdt numeric(12,2) NOT NULL,
 payment_method text NOT NULL,
 status text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_user_idx ON orders(user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 product_id uuid NOT NULL REFERENCES drug_products(id),
 quantity integer NOT NULL,
 unit_price_bdt numeric(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS order_status_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
 status text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
