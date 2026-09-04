# Step 10 — Go-Live Validation & External Services Integration

## Scope

Step 10 converts the Step 9 production-deployable codebase into an operational go-live package. It adds real-provider adapters for the current authentication workflow, a provider/connectivity preflight, a production smoke-test script, production environment templates, and a go-live checklist.

**Step 4 — Pharmacy Network + Live Inventory remains intentionally skipped.** No pharmacy/inventory module is introduced.

## External services integrated

### 1. Authentication delivery
The current signup workflow requires both email and phone verification, while password reset is email-based. Therefore the production configuration is intentionally `VERIFICATION_PROVIDER=resend-twilio`.

- Resend REST API sends verification/password-reset email.
- Twilio Messaging REST API sends phone OTP SMS.
- Verification secrets are never persisted in plaintext; the existing application stores hashed challenge values.
- Console delivery remains development-only.

Required variables:
- `RESEND_API_KEY`
- `VERIFICATION_FROM_EMAIL`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_PHONE`

### 2. SSLCOMMERZ
The existing hosted checkout integration remains the payment provider boundary. Step 10 adds go-live preflight checks for provider connectivity and keeps sandbox as the default until merchant testing is complete.

Required production gate:
1. Public HTTPS API is deployed.
2. IPN URL is configured in the merchant panel.
3. Sandbox transaction succeeds end-to-end.
4. Server-side Order Validation confirms order, amount and BDT currency.
5. Duplicate/replayed callbacks are idempotent.
6. Refund flow is verified.
7. Only then switch to live credentials/endpoints.

### 3. DGHS/OCL medicine catalogue
The existing catalogue adapter remains configured for the DGHS/OCL collection. Step 10 does not invent or seed medicine records. Production synchronization is allowed only after access, terms, rate limits and operational authorization are confirmed.

### 4. Vercel + Railway
Frontend is deployed to Vercel using the public API URL. Backend is deployed to Railway using the existing Dockerfile and managed PostgreSQL. Railway healthcheck is `/health`; readiness is `/ready`.

## Preflight

From the backend directory:

```bash
GO_LIVE_API_URL=https://api.example.com npm run go-live:preflight
```

For a strict provider configuration gate:

```bash
GO_LIVE_API_URL=https://api.example.com GO_LIVE_REQUIRE_PROVIDERS=true npm run go-live:preflight
```

The preflight checks:
- API health
- API readiness / PostgreSQL reachability
- deployed version endpoint
- DGHS/OCL connectivity
- SSLCOMMERZ sandbox or live endpoint connectivity
- required provider configuration when strict mode is enabled

The preflight does not perform a real charge, create a real customer, or expose secrets.

## Public smoke test

```bash
API_URL=https://api.example.com FRONTEND_URL=https://www.example.com ./ops/go-live-smoke.sh
```

Expected baseline:
- `/health` = 200
- `/ready` = 200
- `/version` = 200
- frontend root = 200

## Mandatory staging test sequence

1. Deploy the exact release candidate to staging.
2. Apply migrations and verify `schema_migrations` contains 001–007.
3. Run preflight.
4. Run public smoke tests.
5. Sign up a test customer.
6. Receive email verification through Resend.
7. Receive phone verification through Twilio.
8. Verify both challenges and confirm account becomes ACTIVE.
9. Log in and confirm the HttpOnly session cookie.
10. Request password reset and confirm the email contains the reset link.
11. Reset password and confirm prior sessions are revoked.
12. Synchronize the authorized medicine catalogue and verify provenance.
13. Upload a test prescription and verify unauthorized access is denied.
14. Create a COD order and verify delivery charge is exactly BDT 220.
15. Confirm delivery task creation.
16. Exercise valid delivery state transitions and invalid-transition rejection.
17. Run an SSLCOMMERZ sandbox payment.
18. Verify IPN, success redirect, Order Validation, payment ledger and order state.
19. Replay the callback and verify no duplicate payment/order state transition occurs.
20. Test refund reconciliation.
21. Verify admin audit/security logs contain correlation/request IDs.
22. Run backup and restore drill.
23. Run security regression suite.
24. Approve production promotion.

## Production cutover

Production must use the exact commit/image tested in staging.

Cutover order:

```text
DNS / TLS
  -> Railway API
  -> PostgreSQL readiness
  -> verification providers
  -> SSLCOMMERZ sandbox verification
  -> Vercel frontend
  -> customer smoke test
  -> production payment enablement
```

Keep `SSLCOMMERZ_SANDBOX=true` until the full sandbox gate passes. SSLCOMMERZ's official documentation describes the hosted flow as session creation, IPN notification and server-side Order Validation, and states that amount and transaction must be validated. It also documents separate sandbox and live endpoints. 

## Go-live acceptance criteria

### Infrastructure
- [ ] Frontend HTTPS reachable.
- [ ] API HTTPS reachable.
- [ ] `/health` returns 200.
- [ ] `/ready` returns 200.
- [ ] PostgreSQL is private to the application network.
- [ ] Prescription volume is persistent and private.
- [ ] Production secrets are not committed to Git.

### Authentication
- [ ] Real email provider works.
- [ ] Real SMS provider works.
- [ ] Both signup verification channels work.
- [ ] Password reset email works.
- [ ] No OTP/reset token is written to application logs in production.

### Catalogue
- [ ] Authorized/licensed source access confirmed.
- [ ] Sync succeeds.
- [ ] Source provenance persists.
- [ ] No fake catalogue data is present.

### Orders
- [ ] Backend enforces BDT 220 delivery charge.
- [ ] Final order total is persisted transactionally.
- [ ] Prescription-required products remain server-enforced.

### Payments
- [ ] Sandbox transaction passes.
- [ ] IPN reaches public HTTPS API.
- [ ] Order Validation is called server-side.
- [ ] Amount and currency match persisted order.
- [ ] Replay is idempotent.
- [ ] Refund is reconciled.
- [ ] Live credentials are enabled only after approval.

### Delivery
- [ ] Delivery task creation works.
- [ ] Agent assignment works.
- [ ] Invalid state transitions are rejected.
- [ ] Customer tracking is ownership-scoped.
- [ ] Location retention policy is active.

## Operational rollback

If the release is unhealthy:
1. Stop production promotion.
2. Redeploy the last known-good application image/commit.
3. Re-run `/health` and `/ready`.
4. Inspect order/payment states before resuming traffic.
5. Do not blindly reverse database migrations; use forward-compatible fixes or restore-based recovery for destructive incidents.

## Known Step 10 limitations

- Real provider credentials cannot be created by the application source itself.
- The user must complete Resend/Twilio account setup and sender/domain verification.
- The user must complete SSLCOMMERZ merchant onboarding and configure IPN in the merchant panel.
- DGHS/OCL access/terms must be confirmed before catalogue synchronization.
- Current prescription storage is filesystem/volume based; private object storage is still the preferred path before horizontal scaling.
- Full browser E2E and external penetration testing remain release gates rather than claims of completion from this source-only environment.
