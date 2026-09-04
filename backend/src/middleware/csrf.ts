import { NextFunction, Request, Response } from "express";
import crypto from "node:crypto";
import { env } from "../config/env";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function issueCsrfToken(_req: Request, res: Response) {
  const token = crypto.randomBytes(32).toString("base64url");
  res.cookie(env.csrfCookieName, token, {
    httpOnly: false,
    secure: env.nodeEnv === "production",
    sameSite: env.cookieSameSite,
    path: "/"
  });
  res.json({ success: true, data: { csrfToken: token } });
}

export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (SAFE.has(req.method) || req.path === "/auth/csrf" || req.path.startsWith("/payments/sslcommerz/")) return next();
  const cookie = req.cookies?.[env.csrfCookieName];
  const header = req.get("X-CSRF-Token");
  if (!cookie || !header || cookie.length !== header.length || !crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
    return res.status(403).json({ success: false, error: { code: "CSRF_FAILED", message: "Security validation failed." } });
  }
  next();
}
