# Step 8 — Security Hardening, Testing & Production Readiness

## Scope
Step 8 hardens the existing Steps 1–7 implementation without adding the intentionally skipped Step 4 pharmacy/live-inventory module.

## Security controls added
- Global API rate limiting plus existing authentication-specific throttling.
- Strict request content-type enforcement for API requests.
- Request body size guard before parsing.
- `/health` liveness endpoint and `/ready` database-readiness endpoint.
- Production configuration assertions for HTTPS origins, real verification delivery, strong auth pepper and payment credentials.
- CORS max-age configuration.
- Graceful SIGTERM/SIGINT shutdown and PostgreSQL pool cleanup.
- Session revocation/last-seen schema support.
- Explicit delivery-location retention field for privacy-aware cleanup.
- Audit log request correlation fields.
- Non-root production Docker runtime.
- Docker healthchecks.
- CI pipeline for backend typecheck/tests and frontend typecheck/build.

## Security test coverage
The automated baseline tests verify:
1. Safe internal redirect validation.
2. Password-strength rejection/acceptance.
3. Delivery state-machine invariants.
4. Mandatory BDT 220 server configuration.

Before production, extend the test matrix with authenticated API integration tests covering:
- BOLA/IDOR across customer, delivery-agent and admin resources.
- RBAC/permission denial.
- CSRF failure and token mismatch.
- Session expiration, revocation and logout-all.
- Login throttling and credential stuffing.
- Prescription ownership and private-file access.
- Malicious file signatures, path traversal and oversized multipart requests.
- Payment callback replay, duplicate callbacks, amount/currency tampering and concurrent callbacks.
- Order workflow out-of-sequence calls.
- Delivery transition bypass and concurrent transitions.
- Fixed BDT 220 tampering attempts.
- SQL injection/XSS payload handling.

## Production verification gates
Do not mark production-ready until all are true:
- `npm ci`, typecheck, tests and production builds pass in CI.
- PostgreSQL migrations run successfully on a clean database and an upgrade database.
- Real email/SMS verification provider is configured.
- Private encrypted object storage replaces development filesystem storage.
- SSLCOMMERZ sandbox payment and callback/IPN tests pass through a public HTTPS endpoint.
- Payment reconciliation and refund workflows are manually verified.
- External penetration test / security review is completed.
- Secrets are stored in a managed secret store, never committed.
- Database backup + restore drill succeeds.
- Monitoring/alerting is configured for 5xx, authentication abuse, payment anomalies and queue/fulfillment failures.
- Privacy/legal review covers prescription files and delivery-location retention.

## Deployment baseline
Recommended topology remains portable:
- Next.js frontend container.
- Node/Express backend container.
- Managed PostgreSQL.
- Redis when queues/rate-limit/distributed locking are enabled.
- Private object storage for prescriptions and delivery proof.
- TLS termination at the hosting/load-balancer layer.
- CI builds immutable container images and deploys staging before production.

## Security standard
Use OWASP ASVS as the verification baseline and OWASP REST/payment guidance for API workflow and payment testing. The frontend must never be treated as the security boundary; authorization and workflow validation remain server-side.
