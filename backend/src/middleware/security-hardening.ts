import { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith("/payments/sslcommerz/"),
  handler: (_req, res) => res.status(429).json({
    success: false,
    error: { code: "RATE_LIMITED", message: "Too many requests. Please try again later." }
  })
});

export function requireJsonContentType(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.path.startsWith("/payments/sslcommerz/")) return next();
  if (req.is("application/json") || req.is("multipart/form-data") || req.is("application/x-www-form-urlencoded")) return next();
  return res.status(415).json({ success: false, error: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Unsupported request content type." } });
}

export function rejectUnexpectedContentLength(req: Request, res: Response, next: NextFunction) {
  const raw = req.header("content-length");
  if (raw && (!/^\d+$/.test(raw) || Number(raw) > 12 * 1024 * 1024)) {
    return res.status(413).json({ success: false, error: { code: "REQUEST_TOO_LARGE", message: "Request body is too large." } });
  }
  next();
}
