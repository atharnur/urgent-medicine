import crypto from "node:crypto";
import { env } from "./env";

export const SECURITY = {
  verificationTtlMinutes: 10,
  verificationMaxAttempts: 5,
  verificationResendWindowMinutes: 2,
  passwordResetTtlMinutes: 15,
  loginFailureWindowMinutes: 15,
  loginMaxFailuresPerIdentifier: 8,
  loginMaxFailuresPerIp: 30,
  sessionIdleDays: env.sessionTtlDays,
  csrfCookieName: "urgent_medicine_csrf",
};

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function randomOtp(): string {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashSecret(value: string): string {
  return sha256(`${env.authPepper}:${value}`);
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[\s()-]/g, "");
}

export function isStrongPassword(password: string): boolean {
  if (password.length < 12 || password.length > 128) return false;
  if (/^\s|\s$/.test(password)) return false;
  if (/^(.)\1+$/.test(password)) return false;
  const lower = password.toLowerCase();
  const common = ["password", "password123", "123456789", "12345678", "qwerty", "qwerty123", "admin123", "letmein", "welcome", "iloveyou"];
  if (common.some((x) => lower.includes(x))) return false;
  return /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password);
}

export function isSafeReturnTo(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("/")) return false;
  if (value.startsWith("//") || value.includes("\\")) return false;
  try {
    const url = new URL(value, "https://urgent-medicine.local");
    return url.origin === "https://urgent-medicine.local";
  } catch { return false; }
}
