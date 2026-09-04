# Urgent Medicine

Production-oriented B2C foundation following the Urgent Medicine PRD v2.0.

## Completed
### Step 1
- Next.js + React + TypeScript frontend
- Node.js + Express + TypeScript backend
- PostgreSQL migrations
- Secure HttpOnly cookie sessions
- PostgreSQL-backed medicine catalogue/search foundation (no fake production catalogue)
- Customer addresses, cart and order foundation
- **BDT 220 fixed delivery charge per confirmed order**, calculated and persisted by the backend

### Step 2 — Authentication & Security
- Pending-verification signup with email + phone OTP challenges
- Argon2id password hashing and strong password policy
- Forgot/reset password with session revocation
- Change-password re-authentication with session revocation
- Login brute-force/credential-stuffing throttling and security events
- Generic authentication failures to reduce account enumeration
- Session rotation and server-side session validation
- HttpOnly/Secure/SameSite cookie controls
- Double-submit CSRF protection
- Strict CORS + Helmet security headers
- Safe internal return-to redirect validation
- RBAC permissions foundation
- Audit logs and security-event persistence
- Protected Next.js customer routes

## Run locally
Backend:
```bash
cd backend
npm install
cp .env.example .env
# Set DATABASE_URL, FRONTEND_ORIGIN and AUTH_PEPPER.
npm run db:migrate
npm run dev
```

Frontend:
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

For local development, the default verification provider is `console`, which prints OTP/reset secrets in the backend terminal. Production must configure a real email/SMS provider.

The medicine catalogue intentionally contains no fake production records. Connect an authorized/licensed Bangladesh medicine source through the ingestion layer before production.

## Step 3 — Medicine catalogue
- DGDA/OCL source ingestion architecture with raw provenance and idempotent sync
- Admin-only sync endpoint and `npm run catalog:sync` CLI
- Paginated catalogue search and source verification metadata
- No fake medicine records are inserted

The configured source follows the DGHS Bangladesh Core FHIR documentation, which identifies the DGDA Drug Registry and the national OCL collection. Production use requires confirmation of access, terms, rate limits, and any required authorization.

## Step 5 — Prescription & compliance
- **Step 4 pharmacy/live-inventory implementation is intentionally skipped.** No pharmacy inventory module is added by this step.
- Secure customer prescription records and private file uploads
- JPEG/PNG/PDF validation with 10 MB file-size limit
- SHA-256 file integrity hash and access audit logs
- Admin approve/reject workflow
- Server-side order enforcement for prescription-required catalogue products
- Prescription linked to confirmed order when required

Development storage uses `PRIVATE_UPLOAD_DIR`; production should use private encrypted object storage. This implementation does not diagnose, prescribe, substitute, or auto-approve medicines.

## Step 6 — Payment
Online payment is provider-agnostic at the application boundary and currently has an SSLCOMMERZ V4 adapter. Configure the payment environment variables before enabling online checkout. The backend calculates the payable amount from the persisted order and the mandatory BDT 220 delivery charge; clients cannot override it.

See `docs/STEP_6_PAYMENTS.md` for the payment flow, API endpoints, security boundary, and production prerequisites.

### Step 7 delivery
Delivery management/tracking is implemented independently of the intentionally skipped pharmacy/live-inventory step. See `docs/STEP_7_DELIVERY.md`.


## Step 8 — Security, testing & production readiness
- Global API rate limiting and request content-type/size enforcement
- Liveness/readiness health endpoints
- Production environment validation
- Graceful shutdown
- Session/audit/location retention schema support
- Hardened non-root Docker images with healthchecks
- CI workflow for backend/frontend validation
- Automated baseline security/business-logic tests

See `docs/STEP_8_SECURITY_TESTING_PRODUCTION.md`.

## Step 9 — Production Deployment

Production deployment guidance is in `docs/STEP_9_PRODUCTION_DEPLOYMENT.md`.

Recommended initial topology:
- Next.js frontend → Vercel
- Node.js/Express API → Railway Docker service
- PostgreSQL → managed Railway PostgreSQL
- Prescription files → private persistent volume for the initial single-instance deployment
- SSLCOMMERZ → hosted external payment gateway

The backend production container runs tracked database migrations before starting the API. Health endpoints are `/health` and `/ready`; `/version` exposes the deployed application version without secrets.

Do not put database credentials, payment credentials, authentication secrets, or OCL tokens in `NEXT_PUBLIC_*` variables.


## Step 10 — Go-Live Validation & External Services Integration
- Real-provider adapters for Resend email and Twilio SMS.
- Production verification provider mode: `resend-twilio`.
- Go-live preflight command: `npm run go-live:preflight`.
- Public smoke test: `API_URL=https://api.example.com FRONTEND_URL=https://www.example.com ./ops/go-live-smoke.sh`.
- Production environment templates: `backend/.env.production.example`, `frontend/.env.production.example`.
- Railway config-as-code: `railway.toml`.

See `docs/STEP_10_GO_LIVE_VALIDATION.md`.
