# Step 9 — Production Deployment & Live Environment Setup

## Target production architecture

```text
Customer browser
      |
      v
Vercel — Next.js frontend
      |
      | HTTPS /api/v1
      v
Railway — Node.js + Express API
      |
      +---- Railway PostgreSQL (private)
      |
      +---- Private persistent volume for prescription files (current adapter)
      |
      +---- SSLCOMMERZ hosted gateway (external)
      |
      +---- DGHS/OCL catalogue source (external)
```

The application remains a modular monolith. Step 4 pharmacy/live inventory is intentionally excluded.

## Deployment responsibilities

### Frontend — Vercel
- Deploy the `frontend` application from the repository.
- Production variable:
  - `NEXT_PUBLIC_API_BASE_URL=https://api.<production-domain>/api/v1`
- `NEXT_PUBLIC_*` values are public and are embedded into the browser bundle; never place secrets in them.
- Redeploy after changing environment variables.

### Backend — Railway
Create one API service from the repository using:
- Root directory: repository root
- Dockerfile path: `backend/Dockerfile`
- Public HTTPS domain: `api.<production-domain>`
- Health check: `/health`
- Readiness check: `/ready`
- Start command is built into the image and runs database migrations before the API process.

### PostgreSQL — Railway
Create a managed PostgreSQL service in the same Railway project/environment and reference its `DATABASE_URL` from the API service. Prefer Railway private networking; do not expose PostgreSQL publicly unless there is a specific operational need.

### Prescription storage
The current implementation uses the private filesystem adapter. For the first production deployment, mount a persistent private Railway Volume at `/app/storage/private` and set:
- `PRIVATE_UPLOAD_DIR=/app/storage/private`

This is a transitional deployment choice. Before horizontal API scaling, replace the filesystem adapter with private S3-compatible object storage and signed URLs.

## Required production variables

### API
```text
NODE_ENV=production
PORT=4000
DATABASE_URL=<Railway PostgreSQL reference>
FRONTEND_ORIGIN=https://<frontend-domain>
SESSION_COOKIE_NAME=urgent_medicine_session
SESSION_TTL_DAYS=7
DELIVERY_CHARGE_BDT=220
AUTH_PEPPER=<random secret >= 32 chars>
VERIFICATION_PROVIDER=<real email/SMS provider, not console>
COOKIE_SAME_SITE=lax
CSRF_COOKIE_NAME=urgent_medicine_csrf
PRIVATE_UPLOAD_DIR=/app/storage/private
PAYMENT_PROVIDER=sslcommerz
SSLCOMMERZ_SANDBOX=true
SSLCOMMERZ_STORE_ID=<merchant id>
SSLCOMMERZ_STORE_PASSWORD=<merchant password>
PAYMENT_PUBLIC_BASE_URL=https://api.<production-domain>
PAYMENT_REQUEST_TIMEOUT_MS=30000
OCL_BASE_URL=https://tr.ocl.dghs.gov.bd
OCL_COLLECTION_PATH=/orgs/MoHFW/collections/dgda-registered-drugs-valueset/
OCL_API_TOKEN=<only if required by the deployed OCL instance>
OCL_PAGE_SIZE=250
CATALOG_MAX_RECORDS=100000
CATALOG_REQUEST_TIMEOUT_MS=30000
LOG_LEVEL=info
CORS_MAX_AGE_SECONDS=600
APP_VERSION=<git commit/tag>
```

Do not expose `AUTH_PEPPER`, `DATABASE_URL`, OCL token, SSLCOMMERZ credentials, or provider credentials to the frontend.

## Release sequence

1. Merge code to the protected production branch.
2. CI must pass backend typecheck/tests and frontend typecheck/build.
3. Build the backend and frontend Docker images.
4. Deploy the API to Railway staging first.
5. Verify `/health` and `/ready`.
6. Confirm database migrations completed and `schema_migrations` contains all expected versions.
7. Execute authentication, prescription, order, payment and delivery smoke tests in staging.
8. Execute an SSLCOMMERZ sandbox transaction and verify server-side validation/callback handling.
9. Deploy the frontend to Vercel preview/staging with the staging API URL.
10. Run end-to-end smoke tests.
11. Promote the same tested commit to production.
12. Verify production health/readiness and perform a controlled customer-order smoke test.

## Database migration behavior

The migration runner now maintains `schema_migrations` and skips already-applied files. A PostgreSQL advisory lock serializes migration runners so multiple API instances cannot apply the same migration concurrently.

Migrations are executed before the API process starts in the production Docker image. If a migration fails, the container exits instead of starting an API against an uncertain schema.

## Railway configuration

Railway maps a Docker Compose-style architecture into separate services rather than running the Compose file directly. For this repository:
- API = Docker service from `backend/Dockerfile`
- PostgreSQL = managed Railway PostgreSQL service
- Redis is **not required by the current implementation** and should not be added merely for deployment.

Use Railway service variables/reference variables for secrets and database connection strings.

## Vercel configuration

The frontend needs only the public API base URL at build time. Example:

```text
NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api/v1
```

No database or payment secret belongs in the Vercel frontend environment.

## DNS and TLS

Recommended production domains:
- `www.<domain>` or `<domain>` → Vercel frontend
- `api.<domain>` → Railway API

Configure DNS using the exact records supplied by Vercel/Railway. Do not invent provider-specific IP addresses in application configuration.

The backend production configuration rejects non-HTTPS frontend origins and payment callback base URLs.

## Payment go-live gate

Keep `SSLCOMMERZ_SANDBOX=true` until:
- merchant onboarding is complete;
- sandbox transaction tests pass;
- success/failure/cancel/IPN callbacks reach the public HTTPS API;
- server-side validation confirms order ID, amount and currency;
- replay/idempotency tests pass;
- refund reconciliation is tested.

Then switch to the provider's production credentials/endpoints in a controlled release.

## Production smoke-test checklist

### Infrastructure
- [ ] Vercel production deployment reachable
- [ ] Railway API `/health` returns 200
- [ ] Railway API `/ready` returns 200
- [ ] PostgreSQL reachable privately
- [ ] Persistent prescription volume mounted
- [ ] No secrets appear in logs

### Authentication
- [ ] Sign-up works
- [ ] Verification works through the real provider
- [ ] Login creates secure session
- [ ] Logout revokes session
- [ ] Password reset works
- [ ] Protected routes reject unauthenticated requests

### Medicine catalogue
- [ ] Catalogue sync can reach the authorized/licensed source
- [ ] Search returns real synchronized records
- [ ] Source provenance is visible
- [ ] No demo/fake medicine data is enabled

### Orders/payment
- [ ] Server calculates BDT 220 delivery charge
- [ ] COD order flow works
- [ ] SSLCOMMERZ sandbox flow works
- [ ] Callback validation works
- [ ] Payment replay is rejected/idempotent

### Prescription/compliance
- [ ] Private upload works
- [ ] Unauthorized file access is rejected
- [ ] Admin review works
- [ ] Prescription-required ordering is enforced server-side

### Delivery
- [ ] Delivery task creation works after eligible order confirmation/payment
- [ ] Agent assignment works
- [ ] State transitions reject invalid jumps
- [ ] Customer tracking is ownership-scoped
- [ ] Location data is retained only for the configured period

## Backup and recovery gate

Before production launch:
- enable managed PostgreSQL backups according to the chosen provider plan;
- document the recovery procedure;
- perform at least one restore drill into a non-production database;
- verify application migrations can be replayed against the restored database;
- back up private prescription files independently of database backups;
- document retention and deletion procedures.

A backup that has never been restored is not considered verified.

## Rollback

Application rollback:
1. identify the last known-good commit/image;
2. redeploy that exact version;
3. verify `/health`, `/ready` and smoke tests;
4. inspect payment/order state before accepting new traffic.

Database rollback is **not** an automatic reverse-migration operation. Prefer forward-compatible migrations and restore-based recovery for destructive schema incidents.

## Production observability baseline

At minimum monitor:
- API 5xx rate
- API latency
- readiness failures
- authentication failures/rate limits
- payment callback failures
- payment reconciliation mismatches
- prescription upload/review failures
- order creation failures
- delivery assignment/state-transition failures
- database connection pool errors
- storage capacity

Use correlation/request IDs from the existing API middleware when investigating incidents.

## Current limitations carried into production

- Pharmacy network/live inventory remains intentionally absent.
- Real pharmacy pricing is not implemented.
- Current prescription storage is filesystem-based and should move to private object storage before horizontal scaling.
- Real email/SMS verification provider must be configured.
- SSLCOMMERZ sandbox/live execution requires merchant credentials and public callback reachability.
- DGHS/OCL operational access and usage permissions must be confirmed before production catalogue synchronization.
- External penetration testing/security review remains a release gate for a high-trust healthcare/medicine platform.
