import { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { ZodError } from "zod";

export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = crypto.randomUUID();
  res.setHeader("X-Request-ID", id);
  (req as any).requestId = id;
  next();
}

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "One or more fields are invalid.", details: err.issues.map(i => ({ path: i.path, message: i.message })), requestId: (req as any).requestId } });
  }
  console.error({ requestId: (req as any).requestId, error: err?.message });
  const status = Number(err?.statusCode) || 500;
  res.status(status).json({ success: false, error: { code: err?.code ?? "INTERNAL_ERROR", message: status < 500 ? err.message : "An unexpected error occurred.", requestId: (req as any).requestId } });
}
