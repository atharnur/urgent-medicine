# Urgent Medicine — Deployment

This repository contains the actual application source, not a static HTML preview.

## Architecture

- `frontend/`: Next.js 15 + React 19 + TypeScript customer, delivery and admin UI routes.
- `backend/`: Node.js + Express + TypeScript API and business modules.
- `database/`: PostgreSQL migrations, including auth/security, catalog ingestion, prescriptions, payments and delivery.
- `Dockerfile`s: production containers for frontend and backend.
- `docker-compose.yml`: complete local full-stack environment.

## Production services

Recommended first deployment:

`Vercel (frontend)` → `Railway (Express API)` → `Railway PostgreSQL`

Optional/next services: Redis, S3-compatible private object storage, Resend, Twilio, SSLCommerz.

## Required production environment

### Frontend

`NEXT_PUBLIC_API_BASE_URL=https://<api-domain>/api/v1`

### Backend

Use `backend/.env.production.example` as the baseline. Production requires:

- a real PostgreSQL `DATABASE_URL`
- a strong random `AUTH_PEPPER`
- `FRONTEND_ORIGIN` set to the final frontend origin
- `VERIFICATION_PROVIDER=resend-twilio`
- Resend and Twilio credentials
- SSLCommerz sandbox credentials for staging, live credentials for production
- an object-storage strategy for persistent private prescription files
- validated DGHS/OCL connectivity and any required access token/permission
- `GO_LIVE_REQUIRE_PROVIDERS=true`

## Database

The backend container runs `database/migrations/*.sql` before starting the API. The migration runner uses a PostgreSQL advisory lock and records applied migrations.

## Local full stack

1. Copy the production/local environment files and replace local secrets.
2. Run `docker compose up --build`.
3. Open `http://localhost:3000`.
4. API health: `http://localhost:4000/health`.
5. API readiness: `http://localhost:4000/ready`.

The local compose file intentionally uses the console verification provider and sandbox payment placeholders. Do not promote these settings to production.

## Go-live gates

Before public launch, verify end to end in staging:

- signup → email + phone verification → login
- protected routes and server-side authorization
- medicine search from synchronized source records
- prescription upload, review and secure access
- cart → address → order calculation
- BDT 220 delivery charge persisted by backend
- SSLCommerz sandbox validation, callbacks and replay/idempotency controls
- COD payment pending behavior
- delivery assignment/status/tracking
- provider integrations (Resend/Twilio)
- backup/restore of PostgreSQL
- object-storage persistence for private files
- HTTPS, DNS, monitoring and logs

No production deployment should be considered complete until these gates pass against the real environment.
