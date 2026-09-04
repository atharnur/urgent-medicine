import { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { query } from "../config/db";
import { env } from "../config/env";
import { sha256 } from "../config/security";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: string };
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[env.sessionCookieName];
    if (!token) return res.status(401).json({ success: false, error: { code: "UNAUTHENTICATED", message: "Authentication required." } });
    const hash = sha256(token);
    const result = await query<{ id: string; role: string }>(
      `SELECT u.id, r.name AS role
       FROM sessions s JOIN users u ON u.id=s.user_id JOIN roles r ON r.id=u.role_id
       WHERE s.token_hash=$1 AND s.expires_at>NOW() AND s.revoked_at IS NULL AND u.status='ACTIVE'
       LIMIT 1`,
      [hash]
    );
    if (!result.rowCount) {
      res.clearCookie(env.sessionCookieName, { httpOnly: true, secure: env.nodeEnv === "production", sameSite: env.cookieSameSite, path: "/" });
      return res.status(401).json({ success: false, error: { code: "INVALID_SESSION", message: "Authentication required." } });
    }
    req.user = result.rows[0];
    await query(`UPDATE sessions SET last_seen_at=NOW() WHERE token_hash=$1`, [hash]);
    next();
  } catch (error) { next(error); }
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "You do not have permission to perform this action." } });
    }
    next();
  };
}

export function requirePermission(permission: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, error: { code: "UNAUTHENTICATED", message: "Authentication required." } });
    try {
      const result = await query(
        `SELECT 1 FROM role_permissions rp JOIN roles r ON r.id=rp.role_id JOIN permissions p ON p.id=rp.permission_id
         WHERE r.name=$1 AND p.name=$2 LIMIT 1`,
        [req.user.role, permission]
      );
      if (!result.rowCount) return res.status(403).json({ success: false, error: { code: "FORBIDDEN", message: "You do not have permission to perform this action." } });
      next();
    } catch (error) { next(error); }
  };
}
