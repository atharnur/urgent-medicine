# Step 2 — Complete Authentication & Security System

Implemented against PRD v2.0 authentication/security requirements.

## Backend
- Argon2id password hashing with strong-password validation.
- Pending-verification accounts; both email and phone must be verified before activation.
- Short-lived, single-use, attempt-limited verification OTPs.
- Verification resend throttling.
- Password reset with short-lived, single-use reset token; all sessions revoked after reset.
- Change-password endpoint requiring current-password re-authentication; all sessions revoked after change.
- Secure HttpOnly session cookie; session material is stored only as a SHA-256 hash server-side.
- Existing session is revoked before a new login session is issued (session rotation/fixation defense).
- Login failure tracking by normalized identifier and IP; temporary throttling for brute force/credential stuffing patterns.
- Generic login failures to reduce account enumeration.
- Safe internal `returnTo` validation to prevent open redirects.
- CSRF double-submit protection for state-changing API requests.
- Strict CORS allow-list and secure headers remain enabled.
- RBAC permission schema and middleware foundation.
- Audit logs and security events for authentication-sensitive actions.
- Server-side object ownership controls remain in customer/order/cart APIs.
- Zod validation errors return safe 400 responses rather than generic 500s.

## Frontend
- `/verify`, `/forgot-password`, `/reset-password` public routes.
- Signup now requires terms/privacy acceptance and routes to verification.
- Login supports a safe internal return destination.
- Protected route middleware covers PRD customer protected namespaces.
- Client API automatically obtains a CSRF token before state-changing requests.
- Profile security screen supports password change/re-authentication.

## Production provider boundary
`VERIFICATION_PROVIDER=console` is intentionally a development provider that prints OTP/reset secrets to the backend terminal. Production must use a real email/SMS delivery adapter and must not use console delivery.

## Verification
Run:

```bash
cd backend
npm install
npm run typecheck
npm run build
```

and:

```bash
cd frontend
npm install
npm run typecheck
npm run build
```
