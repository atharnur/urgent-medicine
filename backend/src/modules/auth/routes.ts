import { Router } from "express";
import argon2 from "argon2";
import { z } from "zod";
import { query, withTransaction } from "../../config/db";
import { env } from "../../config/env";
import { SECURITY, hashSecret, isSafeReturnTo, isStrongPassword, normalizePhone, randomOtp, randomToken, sha256 } from "../../config/security";
import { requireAuth } from "../../middleware/auth";
import { verificationDelivery } from "./delivery";

const router = Router();

const signupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().min(7).max(30),
  password: z.string().min(12).max(128),
  confirmPassword: z.string().min(12).max(128),
  termsAccepted: z.literal(true),
  privacyAccepted: z.literal(true)
}).superRefine((v, ctx) => {
  if (v.password !== v.confirmPassword) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmPassword"], message: "Passwords do not match." });
  if (!isStrongPassword(v.password)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: "Password must be 12+ characters and include uppercase, lowercase, number and special character." });
});

const loginSchema = z.object({ email: z.string().trim().email().max(255), password: z.string().min(1).max(128), returnTo: z.string().optional() });
const verifySchema = z.object({ challengeId: z.string().uuid(), code: z.string().regex(/^\d{6}$/) });
const resendSchema = z.object({ userId: z.string().uuid(), channel: z.enum(["EMAIL", "PHONE"]) });
const forgotSchema = z.object({ email: z.string().trim().email().max(255) });
const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), password: z.string().min(12).max(128), confirmPassword: z.string().min(12).max(128) }).superRefine((v, ctx) => {
  if (v.password !== v.confirmPassword) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmPassword"], message: "Passwords do not match." });
  if (!isStrongPassword(v.password)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: "Password must be 12+ characters and include uppercase, lowercase, number and special character." });
});
const resetSchema = z.object({ token: z.string().min(20).max(200), password: z.string().min(12).max(128), confirmPassword: z.string().min(12).max(128) }).superRefine((v, ctx) => {
  if (v.password !== v.confirmPassword) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["confirmPassword"], message: "Passwords do not match." });
  if (!isStrongPassword(v.password)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["password"], message: "Password must be 12+ characters and include uppercase, lowercase, number and special character." });
});

function cookieOptions() {
  return { httpOnly: true, secure: env.nodeEnv === "production", sameSite: env.cookieSameSite, path: "/" } as const;
}

function setSession(res: any, token: string) {
  res.cookie(env.sessionCookieName, token, { ...cookieOptions(), maxAge: env.sessionTtlDays * 86400000 });
}

async function createSession(userId: string, res: any) {
  const token = randomToken(32);
  await query(`INSERT INTO sessions (user_id,token_hash,expires_at) VALUES ($1,$2,NOW()+($3 || ' days')::interval)`, [userId, sha256(token), env.sessionTtlDays]);
  setSession(res, token);
}

function clientIp(req: any): string { return String(req.ip ?? req.socket?.remoteAddress ?? "unknown"); }
function genericAuthFailure(res: any) { return res.status(401).json({ success: false, error: { code: "AUTH_FAILED", message: "Unable to sign in with the supplied credentials." } }); }

async function audit(req: any, action: string, actorUserId: string | null, metadata: Record<string, unknown> = {}) {
  await query(`INSERT INTO audit_logs(actor_user_id,action,request_id,ip_hash,metadata) VALUES($1,$2,$3,$4,$5)`, [actorUserId, action, req.requestId ?? null, sha256(clientIp(req)), JSON.stringify(metadata)]);
}

async function securityEvent(req: any, eventType: string, severity: string, userId: string | null, metadata: Record<string, unknown> = {}) {
  await query(`INSERT INTO security_events(user_id,event_type,severity,request_id,ip_hash,metadata) VALUES($1,$2,$3,$4,$5,$6)`, [userId, eventType, severity, req.requestId ?? null, sha256(clientIp(req)), JSON.stringify(metadata)]);
}

async function issueVerificationChallenge(userId: string, channel: "EMAIL" | "PHONE", destination: string) {
  const recent = await query(`SELECT id FROM verification_challenges WHERE user_id=$1 AND channel=$2 AND purpose='SIGNUP' AND created_at>NOW()-($3 || ' minutes')::interval ORDER BY created_at DESC LIMIT 1`, [userId, channel, SECURITY.verificationResendWindowMinutes]);
  if (recent.rowCount) throw Object.assign(new Error("Please wait before requesting another verification code."), { statusCode: 429, code: "VERIFICATION_RESEND_THROTTLED" });
  const code = randomOtp();
  const result = await query<{ id: string }>(
    `INSERT INTO verification_challenges(user_id,channel,purpose,destination,code_hash,expires_at) VALUES($1,$2,'SIGNUP',$3,$4,NOW()+($5 || ' minutes')::interval) RETURNING id`,
    [userId, channel, destination, hashSecret(code), SECURITY.verificationTtlMinutes]
  );
  await verificationDelivery.sendVerification({ channel, destination, code });
  return result.rows[0].id;
}

router.get("/csrf", (_req, res) => {
  const token = randomToken(32);
  res.cookie(env.csrfCookieName, token, { httpOnly: false, secure: env.nodeEnv === "production", sameSite: env.cookieSameSite, path: "/" });
  res.json({ success: true, data: { csrfToken: token } });
});

router.post("/signup", async (req, res, next) => {
  try {
    const body = signupSchema.parse(req.body);
    const email = body.email.toLowerCase();
    const phone = normalizePhone(body.phone);
    const existing = await query(`SELECT 1 FROM users WHERE lower(email)=lower($1) OR phone=$2 LIMIT 1`, [email, phone]);
    if (existing.rowCount) return res.status(202).json({ success: true, message: "If the account can be created, verification instructions will be provided." });

    const role = await query<{ id: string }>(`SELECT id FROM roles WHERE name='CUSTOMER' LIMIT 1`);
    const passwordHash = await argon2.hash(body.password, { type: argon2.argon2id });
    const user = await withTransaction(async (client) => {
      const r = await client.query<{ id: string }>(
        `INSERT INTO users (role_id,name,email,phone,password_hash,status,terms_accepted_at,privacy_accepted_at,password_changed_at)
         VALUES ($1,$2,$3,$4,$5,'PENDING_VERIFICATION',NOW(),NOW(),NOW()) RETURNING id`,
        [role.rows[0].id, body.name, email, phone, passwordHash]
      );
      return r.rows[0].id;
    });

    const emailChallengeId = await issueVerificationChallenge(user, "EMAIL", email);
    const phoneChallengeId = await issueVerificationChallenge(user, "PHONE", phone);
    await audit(req, "AUTH_SIGNUP_CREATED", user);
    res.status(201).json({ success: true, data: { userId: user, verificationRequired: true, challengeIds: { email: emailChallengeId, phone: phoneChallengeId } } });
  } catch (error) { next(error); }
});

router.post("/verify", async (req, res, next) => {
  try {
    const body = verifySchema.parse(req.body);
    const challenge = await query<{ id: string; user_id: string; channel: "EMAIL" | "PHONE"; code_hash: string; expires_at: string; attempt_count: number; consumed_at: string | null }>(
      `SELECT * FROM verification_challenges WHERE id=$1 LIMIT 1`, [body.challengeId]
    );
    if (!challenge.rowCount) return res.status(400).json({ success: false, error: { code: "VERIFICATION_FAILED", message: "Verification code is invalid or expired." } });
    const c = challenge.rows[0];
    if (c.consumed_at || new Date(c.expires_at).getTime() <= Date.now() || c.attempt_count >= SECURITY.verificationMaxAttempts) {
      return res.status(400).json({ success: false, error: { code: "VERIFICATION_FAILED", message: "Verification code is invalid or expired." } });
    }
    const valid = hashSecret(body.code) === c.code_hash;
    if (!valid) {
      await query(`UPDATE verification_challenges SET attempt_count=attempt_count+1 WHERE id=$1`, [c.id]);
      await securityEvent(req, "VERIFICATION_FAILED", "LOW", c.user_id);
      return res.status(400).json({ success: false, error: { code: "VERIFICATION_FAILED", message: "Verification code is invalid or expired." } });
    }

    await withTransaction(async (client) => {
      await client.query(`UPDATE verification_challenges SET consumed_at=NOW() WHERE id=$1 AND consumed_at IS NULL`, [c.id]);
      const field = c.channel === "EMAIL" ? "email_verified_at" : "phone_verified_at";
      await client.query(`UPDATE users SET ${field}=NOW(), updated_at=NOW() WHERE id=$1`, [c.user_id]);
      const verified = await client.query<{email_verified_at:string|null;phone_verified_at:string|null}>(`SELECT email_verified_at,phone_verified_at FROM users WHERE id=$1 FOR UPDATE`, [c.user_id]);
      const v = verified.rows[0];
      if (v.email_verified_at && v.phone_verified_at) await client.query(`UPDATE users SET status='ACTIVE', updated_at=NOW() WHERE id=$1`, [c.user_id]);
    });

    const status = await query<{ status: string; email_verified_at: string | null; phone_verified_at: string | null }>(`SELECT status,email_verified_at,phone_verified_at FROM users WHERE id=$1`, [c.user_id]);
    await audit(req, "AUTH_CONTACT_VERIFIED", c.user_id, { channel: c.channel });
    res.json({ success: true, data: { verified: true, channel: c.channel, accountActive: status.rows[0].status === "ACTIVE", emailVerified: !!status.rows[0].email_verified_at, phoneVerified: !!status.rows[0].phone_verified_at } });
  } catch (error) { next(error); }
});

router.post("/resend-verification", async (req, res, next) => {
  try {
    const body = resendSchema.parse(req.body);
    const user = await query<{ email: string; phone: string; email_verified_at: string | null; phone_verified_at: string | null }>(`SELECT email,phone,email_verified_at,phone_verified_at FROM users WHERE id=$1`, [body.userId]);
    if (!user.rowCount) return res.status(202).json({ success: true, message: "If verification can be resent, instructions will be provided." });
    const u = user.rows[0];
    if (body.channel === "EMAIL" && u.email_verified_at) return res.status(202).json({ success: true, message: "If verification can be resent, instructions will be provided." });
    if (body.channel === "PHONE" && u.phone_verified_at) return res.status(202).json({ success: true, message: "If verification can be resent, instructions will be provided." });
    const destination = body.channel === "EMAIL" ? u.email : u.phone;
    const id = await issueVerificationChallenge(body.userId, body.channel, destination);
    await audit(req, "AUTH_VERIFICATION_RESENT", body.userId, { channel: body.channel });
    res.status(202).json({ success: true, data: { challengeId: id } });
  } catch (error) { next(error); }
});

router.post("/login", async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const email = body.email.toLowerCase();
    const identifierHash = sha256(email);
    const ipHash = sha256(clientIp(req));
    const recent = await query<{ count: string }>(
      `SELECT COUNT(*)::text count FROM login_attempts WHERE identifier_hash=$1 AND successful=false AND created_at>NOW()-($2 || ' minutes')::interval`, [identifierHash, SECURITY.loginFailureWindowMinutes]
    );
    const ipRecent = await query<{ count: string }>(
      `SELECT COUNT(*)::text count FROM login_attempts WHERE ip_hash=$1 AND successful=false AND created_at>NOW()-($2 || ' minutes')::interval`, [ipHash, SECURITY.loginFailureWindowMinutes]
    );
    if (Number(recent.rows[0].count) >= SECURITY.loginMaxFailuresPerIdentifier || Number(ipRecent.rows[0].count) >= SECURITY.loginMaxFailuresPerIp) {
      await securityEvent(req, "LOGIN_THROTTLED", "MEDIUM", null);
      return genericAuthFailure(res);
    }

    const result = await query<{ id: string; password_hash: string; status: string }>(`SELECT id,password_hash,status FROM users WHERE lower(email)=lower($1) LIMIT 1`, [email]);
    if (!result.rowCount) {
      await query(`INSERT INTO login_attempts(identifier_hash,ip_hash,successful) VALUES($1,$2,false)`, [identifierHash, ipHash]);
      return genericAuthFailure(res);
    }
    const user = result.rows[0];
    const valid = await argon2.verify(user.password_hash, body.password).catch(() => false);
    if (!valid || user.status !== "ACTIVE") {
      await query(`INSERT INTO login_attempts(identifier_hash,ip_hash,user_id,successful) VALUES($1,$2,$3,false)`, [identifierHash, ipHash, user.id]);
      if (user.status === "LOCKED") await securityEvent(req, "LOGIN_LOCKED_ACCOUNT", "MEDIUM", user.id);
      else await securityEvent(req, "LOGIN_FAILED", "LOW", user.id);
      return genericAuthFailure(res);
    }
    if (body.returnTo && !isSafeReturnTo(body.returnTo)) return res.status(400).json({ success: false, error: { code: "INVALID_REDIRECT", message: "Invalid return destination." } });

    await query(`INSERT INTO login_attempts(identifier_hash,ip_hash,user_id,successful) VALUES($1,$2,$3,true)`, [identifierHash, ipHash, user.id]);
    const oldToken = req.cookies?.[env.sessionCookieName];
    if (oldToken) await query(`DELETE FROM sessions WHERE token_hash=$1`, [sha256(oldToken)]);
    await query(`DELETE FROM sessions WHERE user_id=$1 AND expires_at<=NOW()`, [user.id]);
    await createSession(user.id, res);
    await query(`UPDATE users SET last_login_at=NOW(),updated_at=NOW() WHERE id=$1`, [user.id]);
    await audit(req, "AUTH_LOGIN_SUCCESS", user.id);
    res.json({ success: true, data: { userId: user.id, returnTo: body.returnTo && isSafeReturnTo(body.returnTo) ? body.returnTo : "/dashboard" } });
  } catch (error) { next(error); }
});

router.post("/forgot-password", async (req, res, next) => {
  try {
    const body = forgotSchema.parse(req.body);
    const generic = { success: true, message: "If an account matches the supplied information, password reset instructions will be provided." };
    const user = await query<{ id: string; email: string; status: string }>(`SELECT id,email,status FROM users WHERE lower(email)=lower($1) LIMIT 1`, [body.email.toLowerCase()]);
    if (!user.rowCount || user.rows[0].status === "DISABLED") return res.status(202).json(generic);
    const active = await query(`SELECT id FROM password_reset_challenges WHERE user_id=$1 AND consumed_at IS NULL AND expires_at>NOW() LIMIT 1`, [user.rows[0].id]);
    if (active.rowCount) return res.status(202).json(generic);
    const token = randomToken(48);
    await query(`INSERT INTO password_reset_challenges(user_id,token_hash,expires_at) VALUES($1,$2,NOW()+($3 || ' minutes')::interval)`, [user.rows[0].id, hashSecret(token), SECURITY.passwordResetTtlMinutes]);
    await verificationDelivery.sendPasswordReset({ destination: user.rows[0].email, token });
    await audit(req, "AUTH_PASSWORD_RESET_REQUESTED", user.rows[0].id);
    return res.status(202).json(generic);
  } catch (error) { next(error); }
});

router.post("/reset-password", async (req, res, next) => {
  try {
    const body = resetSchema.parse(req.body);
    const challenge = await query<{ id: string; user_id: string }>(`SELECT id,user_id FROM password_reset_challenges WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>NOW() LIMIT 1`, [hashSecret(body.token)]);
    if (!challenge.rowCount) return res.status(400).json({ success: false, error: { code: "RESET_FAILED", message: "Reset link is invalid or expired." } });
    const passwordHash = await argon2.hash(body.password, { type: argon2.argon2id });
    await withTransaction(async (client) => {
      await client.query(`UPDATE users SET password_hash=$1,password_changed_at=NOW(),updated_at=NOW() WHERE id=$2`, [passwordHash, challenge.rows[0].user_id]);
      await client.query(`UPDATE password_reset_challenges SET consumed_at=NOW() WHERE id=$1`, [challenge.rows[0].id]);
      await client.query(`DELETE FROM sessions WHERE user_id=$1`, [challenge.rows[0].user_id]);
    });
    await audit(req, "AUTH_PASSWORD_RESET_COMPLETED", challenge.rows[0].user_id);
    res.json({ success: true, message: "Password updated. Please sign in again." });
  } catch (error) { next(error); }
});

router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const body = changePasswordSchema.parse(req.body);
    const user = await query<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id=$1 AND status='ACTIVE'`, [req.user!.id]);
    if (!user.rowCount || !(await argon2.verify(user.rows[0].password_hash, body.currentPassword).catch(() => false))) {
      await securityEvent(req, "PASSWORD_REAUTH_FAILED", "MEDIUM", req.user!.id);
      return res.status(401).json({ success: false, error: { code: "REAUTH_FAILED", message: "Current password is incorrect." } });
    }
    const passwordHash = await argon2.hash(body.password, { type: argon2.argon2id });
    await withTransaction(async client => {
      await client.query(`UPDATE users SET password_hash=$1,password_changed_at=NOW(),updated_at=NOW() WHERE id=$2`, [passwordHash, req.user!.id]);
      await client.query(`DELETE FROM sessions WHERE user_id=$1`, [req.user!.id]);
    });
    res.clearCookie(env.sessionCookieName, cookieOptions());
    await audit(req, "AUTH_PASSWORD_CHANGED", req.user!.id);
    res.json({ success: true, message: "Password changed. Please sign in again." });
  } catch (error) { next(error); }
});

router.post("/logout", requireAuth, async (req, res, next) => {
  try {
    const token = req.cookies?.[env.sessionCookieName];
    if (token) await query(`DELETE FROM sessions WHERE token_hash=$1`, [sha256(token)]);
    await audit(req, "AUTH_LOGOUT", req.user!.id);
    res.clearCookie(env.sessionCookieName, cookieOptions());
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.post("/logout-all", requireAuth, async (req, res, next) => {
  try {
    await query(`DELETE FROM sessions WHERE user_id=$1`, [req.user!.id]);
    await audit(req, "AUTH_LOGOUT_ALL", req.user!.id);
    res.clearCookie(env.sessionCookieName, cookieOptions());
    res.json({ success: true });
  } catch (error) { next(error); }
});

router.get("/session", requireAuth, async (req, res) => res.json({ success: true, data: { userId: req.user!.id, role: req.user!.role } }));

export default router;
