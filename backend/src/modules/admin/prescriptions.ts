import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { pool, query } from "../../config/db";
import { requireAuth, requirePermission } from "../../middleware/auth";
import { readPrivateObject } from "../../services/private-storage";

const router = Router();
const reviewSchema = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), note: z.string().trim().max(1000).optional() });

router.get("/prescriptions", requireAuth, requirePermission("prescription:review"), async (req, res, next) => {
  try {
    const status = z.string().optional().parse(req.query.status);
    const params: string[] = [];
    const where = status ? `WHERE p.status=$1` : "";
    if (status) params.push(status);
    const r = await query(`
      SELECT p.id,p.customer_id AS "customerId",u.name AS "customerName",u.email AS "customerEmail",p.status,
             p.issued_at AS "issuedAt",p.expires_at AS "expiresAt",p.notes,p.rejection_reason AS "rejectionReason",
             p.created_at AS "createdAt",
             COALESCE((SELECT json_agg(json_build_object('id',f.id,'filename',f.original_filename,'mimeType',f.mime_type,'byteSize',f.byte_size) ORDER BY f.created_at DESC) FROM prescription_files f WHERE f.prescription_id=p.id),'[]'::json) AS files
      FROM prescriptions p JOIN users u ON u.id=p.customer_id ${where}
      ORDER BY p.created_at ASC`, params);
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
});

router.post("/prescriptions/:id/review", requireAuth, requirePermission("prescription:review"), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const body = reviewSchema.parse(req.body);
    await client.query("BEGIN");
    const p = await client.query(`SELECT id,status FROM prescriptions WHERE id=$1 FOR UPDATE`, [req.params.id]);
    if (!p.rowCount) throw Object.assign(new Error("Prescription not found."), { statusCode: 404, code: "NOT_FOUND" });
    if (["REVOKED", "EXPIRED"].includes(p.rows[0].status)) throw Object.assign(new Error("This prescription is not reviewable."), { statusCode: 400, code: "NOT_REVIEWABLE" });
    const nextStatus = body.decision === "APPROVED" ? "APPROVED" : "REJECTED";
    await client.query(
      `UPDATE prescriptions SET status=$1,reviewed_by=$2,reviewed_at=NOW(),rejection_reason=$3,updated_at=NOW() WHERE id=$4`,
      [nextStatus, req.user!.id, body.decision === "REJECTED" ? (body.note ?? "Prescription rejected during review.") : null, req.params.id]
    );
    await client.query(`INSERT INTO prescription_reviews(prescription_id,reviewer_user_id,decision,note) VALUES($1,$2,$3,$4)`, [req.params.id, req.user!.id, body.decision, body.note ?? null]);
    await client.query(`INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)`, [req.user!.id, `PRESCRIPTION_${body.decision}`, "prescription", req.params.id, JSON.stringify({ note: body.note ?? null })]);
    await client.query("COMMIT");
    res.json({ success: true, data: { prescriptionId: req.params.id, status: nextStatus } });
  } catch (e) { await client.query("ROLLBACK"); next(e); } finally { client.release(); }
});

export default router;


router.get("/prescriptions/:id/files/:fileId", requireAuth, requirePermission("prescription:review"), async (req, res, next) => {
  try {
    const r = await query<{ storage_key:string; original_filename:string; mime_type:string; byte_size:number }>(
      `SELECT f.storage_key,f.original_filename,f.mime_type,f.byte_size
       FROM prescription_files f WHERE f.id=$1 AND f.prescription_id=$2`, [req.params.fileId, req.params.id]
    );
    if (!r.rowCount) return res.status(404).json({ success:false, error:{code:"NOT_FOUND",message:"Prescription file not found."} });
    const f=r.rows[0]; const buffer=await readPrivateObject(f.storage_key);
    await query(`INSERT INTO prescription_access_logs(prescription_id,actor_user_id,action,ip_hash) VALUES($1,$2,'ADMIN_DOWNLOAD_FILE',$3)`, [req.params.id, req.user!.id, req.ip ? crypto.createHash("sha256").update(req.ip).digest("hex") : null]);
    res.setHeader("Content-Type",f.mime_type); res.setHeader("Content-Length",String(f.byte_size)); res.setHeader("Content-Disposition",`inline; filename*=UTF-8''${encodeURIComponent(f.original_filename)}`); res.setHeader("Cache-Control","private, no-store"); res.send(buffer);
  } catch(e){next(e);}
});
