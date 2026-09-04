import { Router } from "express";
import { query } from "../../config/db";

const router = Router();

router.get("/", async (req,res,next) => {
  try {
    const q = String(req.query.q ?? "").trim();
    const page = Math.max(Number(req.query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 50);
    const offset = (page - 1) * limit;
    const manufacturer = String(req.query.manufacturer ?? "").trim();
    const dosageForm = String(req.query.dosageForm ?? "").trim();
    const prescriptionRequired = req.query.prescriptionRequired === undefined ? null : String(req.query.prescriptionRequired) === "true";
    const params: any[] = [q, manufacturer, dosageForm, prescriptionRequired, limit, offset];
    const r = await query(`
      SELECT id,trade_name AS "tradeName",generic_name AS "genericName",manufacturer,strength,
             dosage_form AS "dosageForm",pack_size AS "packSize",prescription_required AS "prescriptionRequired",
             dar_identifier AS "darIdentifier",source_system AS "sourceSystem",verification_status AS "verificationStatus"
      FROM drug_products
      WHERE status='ACTIVE'
        AND verification_status IN ('VERIFIED','UNVERIFIED','REVIEW_REQUIRED')
        AND ($1='' OR search_document ILIKE '%'||$1||'%')
        AND ($2='' OR lower(coalesce(manufacturer,''))=lower($2))
        AND ($3='' OR lower(coalesce(dosage_form,''))=lower($3))
        AND ($4::boolean IS NULL OR prescription_required=$4)
      ORDER BY trade_name
      LIMIT $5 OFFSET $6`, params);
    const count = await query<{count:string}>(`SELECT count(*)::text AS count FROM drug_products WHERE status='ACTIVE' AND ($1='' OR search_document ILIKE '%'||$1||'%') AND ($2='' OR lower(coalesce(manufacturer,''))=lower($2)) AND ($3='' OR lower(coalesce(dosage_form,''))=lower($3)) AND ($4::boolean IS NULL OR prescription_required=$4)`, [q,manufacturer,dosageForm,prescriptionRequired]);
    res.json({success:true,data:r.rows,pagination:{page,limit,total:Number(count.rows[0].count),pages:Math.ceil(Number(count.rows[0].count)/limit)}});
  } catch(e){next(e);}
});

router.get("/:id", async(req,res,next) => {
  try {
    const r=await query(`
      SELECT id,trade_name AS "tradeName",generic_name AS "genericName",manufacturer,strength,
             dosage_form AS "dosageForm",pack_size AS "packSize",indication,
             prescription_required AS "prescriptionRequired",dar_identifier AS "darIdentifier",
             source_system AS "sourceSystem",source_code AS "sourceCode",source_version AS "sourceVersion",
             source_url AS "sourceUrl",verification_status AS "verificationStatus",last_verified_at AS "lastVerifiedAt"
      FROM drug_products WHERE id=$1 AND status='ACTIVE'`,[req.params.id]);
    if(!r.rowCount) return res.status(404).json({success:false,error:{code:"NOT_FOUND",message:"Medicine not found."}});
    res.json({success:true,data:r.rows[0]});
  } catch(e){next(e);}
});
export default router;
