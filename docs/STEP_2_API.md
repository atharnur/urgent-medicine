# Step 2 Authentication API

All endpoints are under `/api/v1/auth`.

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| GET | `/csrf` | Public | Issue CSRF token |
| POST | `/signup` | Public + CSRF | Create pending customer and issue email/phone verification challenges |
| POST | `/verify` | Public + CSRF | Consume a one-time verification OTP |
| POST | `/resend-verification` | Public + CSRF | Request a new verification challenge, rate-limited |
| POST | `/login` | Public + CSRF | Validate credentials and create server-side session |
| POST | `/logout` | Session + CSRF | Revoke current session |
| POST | `/logout-all` | Session + CSRF | Revoke all sessions for current user |
| GET | `/session` | Session | Return current authenticated identity |
| POST | `/forgot-password` | Public + CSRF | Generic password-reset request |
| POST | `/reset-password` | Public + CSRF | Consume short-lived reset token and rotate credentials |
| POST | `/change-password` | Session + CSRF | Re-authenticate and change password |

### Session model

The browser receives an opaque session cookie. PostgreSQL stores only a SHA-256 hash of the session token. Session lookup verifies expiry and active account status on the server.

### CSRF model

A separate CSRF cookie is issued by `/csrf`. Every state-changing browser request must send the same value in `X-CSRF-Token`. The API rejects missing/mismatched values.

### Authorization model

Customer APIs use server-side permissions such as `order:read:self`, `order:create:self`, `cart:read:self`, and `customer:read:self`. Resource queries also constrain records by `req.user.id` to prevent IDOR/BOLA.
