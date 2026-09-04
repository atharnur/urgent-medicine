import crypto from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { pool, query } from "../../config/db";
import { requireAuth, requirePermission } from "../../middleware/auth";
import { deletePrivateObject, putPrivateObject, readPrivateObject } from "../../services/private-storage";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const itemSchema = z.object({
  drugProductId: z.string().uuid().optional(),
  medicineName: z.string().trim().min(1).max(200),
  dosageInstructions: z.string().trim().max(500).optional(),
  quantity: z.number().int().positive().max(10000).optional(),
});
const createSchema = z.object({
  issuedAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  notes: z.string().trim().max(1000).optional(),
  items: z.array(itemSchema).max(30).optional(),
});

async function logAccess(prescriptionId: string, actorId: string, action: string, ip?: string) {
  const ipHash = ip ? crypto.createHash("sha256").update(ip).digest("hex") : null;
  await query(`INSERT INTO prescription_access_logs(prescription_id,actor_user_id,action,ip_hash) VALUES($1,$2,$3,$4)`, [prescriptionId, actorId, action, ipHash]);
}

router.get("/", requireAuth, requirePermission("prescription:read:self"), async (req, res, next) => {
  try {
    const r = await query(`
      SELECT p.id,p.status,p.issued_at AS "issuedAt",p.expires_at AS "expiresAt",p.notes,
             p.reviewed_at AS "reviewedAt",p.rejection_reason AS "rejectionReason",p.created_at AS "createdAt",
             COALESCE((SELECT json_agg(json_build_object('id',f.id,'filename',f.original_filename,'mimeType',f.mime_type,'byteSize',f.byte_size,'createdAt',f.created_at) ORDER BY f.created_at DESC) FROM prescription_files f WHERE f.prescription_id=p.id),'[]'::json) AS files,
             COALESCE((SELECT json_agg(json_build_object('id',i.id,'drugProductId',i.drug_product_id,'medicineName',i.medicine_name_snapshot,'dosageInstructions',i.dosage_instructions,'quantity',i.quantity) ORDER BY i.created_at) FROM prescription_items i WHERE i.prescription_id=p.id),'[]'::json) AS items
      FROM prescriptions p WHERE p.customer_id=$1 ORDER BY p.created_at DESC`, [req.user!.id]);
    for (const row of r.rows) await logAccess(row.id, req.user!.id, "LIST");
    res.json({ success: true, data: r.rows });
  } catch (e) { next(e); }
});

router.post("/", requireAuth, requirePermission("prescription:create:self"), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const body = createSchema.parse(req.body);
    if (body.expiresAt && body.issuedAt && new Date(body.expiresAt) <= new Date(body.issuedAt)) {
      throw Object.assign(new Error("Prescription expiry must be after issue date."), { statusCode: 400, code: "INVALID_EXPIRY" });
    }
    await client.query("BEGIN");
    const p = await client.query<{ id: string }>(
      `INSERT INTO prescriptions(customer_id,issued_at,expires_at,notes) VALUES($1,$2,$3,$4) RETURNING id`,
      [req.user!.id, body.issuedAt ?? null, body.expiresAt ?? null, body.notes ?? null]
    );
    for (const item of body.items ?? []) {
      if (item.drugProductId) {
        const exists = await client.query(`SELECT 1 FROM drug_products WHERE id=$1 AND status='ACTIVE'`, [item.drugProductId]);
        if (!exists.rowCount) throw Object.assign(new Error("One or more medicines are invalid."), { statusCode: 400, code: "INVALID_MEDICINE" });
      }
      await client.query(
        `INSERT INTO prescription_items(prescription_id,drug_product_id,medicine_name_snapshot,dosage_instructions,quantity) VALUES($1,$2,$3,$4,$5)`,
        [p.rows[0].id, item.drugProductId ?? null, item.medicineName, item.dosageInstructions ?? null, item.quantity ?? null]
      );
    }
    await client.query("COMMIT");
    await logAccess(p.rows[0].id, req.user!.id, "CREATE", req.ip);
    res.status(201).json({ success: true, data: { prescriptionId: p.rows[0].id, status: "PENDING_REVIEW" } });
  } catch (e) { await client.query("ROLLBACK"); next(e); } finally { client.release(); }
});

router.post("/:id/files", requireAuth, requirePermission("prescription:upload:self"), upload.single("file"), async (req, res, next) => {
  try {
    const prescription = await query(`SELECT id,status FROM prescriptions WHERE id=$1 AND customer_id=$2`, [req.params.id, req.user!.id]);
    if (!prescription.rowCount) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Prescription not found." } });
    if (["REVOKED", "EXPIRED", "REJECTED"].includes(prescription.rows[0].status)) return res.status(400).json({ success: false, error: { code: "PRESCRIPTION_NOT_UPLOADABLE", message: "This prescription cannot accept a new file." } });
    if (!req.file) return res.status(400).json({ success: false, error: { code: "FILE_REQUIRED", message: "A prescription file is required." } });
    const allowed = new Set(["image/jpeg", "image/png", "application/pdf"]);
    if (!allowed.has(req.file.mimetype)) return res.status(400).json({ success: false, error: { code: "UNSUPPORTED_FILE_TYPE", message: "Only JPEG, PNG or PDF files are accepted." } });
    if (!req.file.size) return res.status(400).json({ success: false, error: { code: "EMPTY_FILE", message: "The uploaded file is empty." } });
    const signatureOk = (req.file.mimetype === "application/pdf" && req.file.buffer.subarray(0, 5).toString("ascii") === "%PDF-")
      || (req.file.mimetype === "image/png" && req.file.buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])))
      || (req.file.mimetype === "image/jpeg" && req.file.buffer.subarray(0, 3).equals(Buffer.from([255,216,255])));
    if (!signatureOk) return res.status(400).json({ success: false, error: { code: "INVALID_FILE_CONTENT", message: "The uploaded file content does not match its declared type." } });

    const sha256 = crypto.createHash("sha256").update(req.file.buffer).digest("hex");
    const key = `prescriptions/${req.user!.id}/${req.params.id}/${crypto.randomUUID()}`;
    const stored = await putPrivateObject(key, req.file.buffer);
    try {
      const r = await query<{ id: string }>(
        `INSERT INTO prescription_files(prescription_id,storage_key,original_filename,mime_type,byte_size,sha256) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [req.params.id, stored.key, req.file.originalname.slice(0, 255), req.file.mimetype, req.file.size, sha256]
      );
      await logAccess(req.params.id, req.user!.id, "UPLOAD_FILE", req.ip);
      res.status(201).json({ success: true, data: { fileId: r.rows[0].id, filename: req.file.originalname.slice(0, 255), mimeType: req.file.mimetype, byteSize: req.file.size } });
    } catch (dbError) {
      await deletePrivateObject(stored.key);
      throw dbError;
    }
  } catch (e) { next(e); }
});

router.get("/:id/files/:fileId", requireAuth, requirePermission("prescription:access:self"), async (req, res, next) => {
  try {
    const r = await query<{ id: string; storage_key: string; original_filename: string; mime_type: string; byte_size: number }>(
      `SELECT f.id,f.storage_key,f.original_filename,f.mime_type,f.byte_size
       FROM prescription_files f JOIN prescriptions p ON p.id=f.prescription_id
       WHERE f.id=$1 AND p.id=$2 AND p.customer_id=$3`, [req.params.fileId, req.params.id, req.user!.id]
    );
    if (!r.rowCount) return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Prescription file not found." } });
    const file = r.rows[0];
    const buffer = await readPrivateObject(file.storage_key);
    await logAccess(req.params.id, req.user!.id, "DOWNLOAD_FILE", req.ip);
    res.setHeader("Content-Type", file.mime_type);
    res.setHeader("Content-Length", String(file.byte_size));
    res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(file.original_filename)}`);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(buffer);
  } catch (e) { next(e); }
});

export default router;
