import { Router } from "express";
import { query } from "../../config/db";
import { requireAuth, requireRole } from "../../middleware/auth";
import { runCatalogSync } from "./service";

const router = Router();

router.post("/sync", requireAuth, requireRole("ADMIN"), async (_req,res,next) => {
  try {
    const result = await runCatalogSync();
    res.status(202).json({success:true,data:result});
  } catch (e) { next(e); }
});

router.get("/sync/jobs", requireAuth, requireRole("ADMIN"), async (req,res,next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20),1),100);
    const r = await query(`SELECT id,job_type AS "jobType",status,started_at AS "startedAt",completed_at AS "completedAt",records_seen AS "recordsSeen",records_created AS "recordsCreated",records_updated AS "recordsUpdated",records_unchanged AS "recordsUnchanged",records_invalid AS "recordsInvalid",error_message AS "errorMessage" FROM data_sync_jobs ORDER BY started_at DESC LIMIT $1`, [limit]);
    res.json({success:true,data:r.rows});
  } catch(e){next(e);}
});

export default router;
