-- Step 3: production medicine catalogue + source ingestion foundation.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE drug_products
  ALTER COLUMN generic_name DROP NOT NULL,
  ALTER COLUMN manufacturer DROP NOT NULL;

ALTER TABLE drug_products
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS source_code text,
  ADD COLUMN IF NOT EXISTS source_version text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS source_hash text,
  ADD COLUMN IF NOT EXISTS raw_source_payload jsonb,
  ADD COLUMN IF NOT EXISTS source_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (verification_status IN ('UNVERIFIED','VERIFIED','RETIRED','REVIEW_REQUIRED'));

CREATE UNIQUE INDEX IF NOT EXISTS drug_products_source_identity_idx
  ON drug_products(source_system, source_code)
  WHERE source_system IS NOT NULL AND source_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS drug_products_source_system_idx ON drug_products(source_system);
CREATE INDEX IF NOT EXISTS drug_products_verification_idx ON drug_products(verification_status);
CREATE INDEX IF NOT EXISTS drug_products_search_trgm_idx ON drug_products USING gin (search_document gin_trgm_ops);

CREATE TABLE IF NOT EXISTS data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('REGULATORY','REFERENCE','PARTNER','INTERNAL')),
  base_url text NOT NULL,
  collection_path text,
  enabled boolean NOT NULL DEFAULT true,
  requires_authentication boolean NOT NULL DEFAULT false,
  terms_reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id uuid NOT NULL REFERENCES data_sources(id) ON DELETE CASCADE,
  external_key text NOT NULL,
  source_version text,
  payload jsonb NOT NULL,
  payload_hash text NOT NULL,
  source_updated_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RETIRED','REVIEW_REQUIRED','INVALID')),
  UNIQUE(data_source_id, external_key)
);
CREATE INDEX IF NOT EXISTS source_records_source_idx ON source_records(data_source_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS source_records_hash_idx ON source_records(payload_hash);

CREATE TABLE IF NOT EXISTS data_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id uuid NOT NULL REFERENCES data_sources(id),
  job_type text NOT NULL CHECK (job_type IN ('FULL','INCREMENTAL','VALIDATION')),
  status text NOT NULL CHECK (status IN ('RUNNING','SUCCEEDED','PARTIAL','FAILED')),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  records_seen integer NOT NULL DEFAULT 0,
  records_created integer NOT NULL DEFAULT 0,
  records_updated integer NOT NULL DEFAULT 0,
  records_unchanged integer NOT NULL DEFAULT 0,
  records_invalid integer NOT NULL DEFAULT 0,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS data_sync_jobs_source_idx ON data_sync_jobs(data_source_id, started_at DESC);

CREATE TABLE IF NOT EXISTS data_quality_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id uuid REFERENCES data_sources(id) ON DELETE SET NULL,
  source_record_id uuid REFERENCES source_records(id) ON DELETE SET NULL,
  drug_product_id uuid REFERENCES drug_products(id) ON DELETE SET NULL,
  issue_code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  field_name text,
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','IGNORED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS data_quality_issues_status_idx ON data_quality_issues(status, severity, created_at DESC);

INSERT INTO data_sources(code,name,source_type,base_url,collection_path,requires_authentication,notes)
VALUES (
  'DGDA_OCL_REGISTERED_DRUGS',
  'DGDA Registered Drugs via DGHS OCL',
  'REGULATORY',
  'https://tr.ocl.dghs.gov.bd',
  '/orgs/MoHFW/collections/dgda-registered-drugs-valueset/',
  false,
  'Official DGHS-published terminology source. Validate access, usage terms, and operational limits before production synchronization.'
)
ON CONFLICT(code) DO UPDATE SET
  name=EXCLUDED.name,
  base_url=EXCLUDED.base_url,
  collection_path=EXCLUDED.collection_path,
  notes=EXCLUDED.notes,
  updated_at=now();
