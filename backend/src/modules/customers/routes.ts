import { Router } from "express";
import { z } from "zod";
import { query } from "../../config/db";
import { requireAuth, requirePermission } from "../../middleware/auth";

const router = Router();
const addressSchema = z.object({
  label: z.string().trim().min(1).max(50),
  line1: z.string().trim().min(3).max(255),
  city: z.string().trim().min(2).max(100),
  postalCode: z.string().trim().max(20)
});

router.get("/me", requireAuth, requirePermission("customer:read:self"), async (req,res,next) => {
  try {
    const r=await query(`SELECT id,name,email,phone FROM users WHERE id=$1`,[req.user!.id]);
    res.json({success:true,data:r.rows[0]});
  } catch(e){next(e);}
});
router.get("/me/addresses", requireAuth, requirePermission("address:read:self"), async (req,res,next) => {
  try {
    const r=await query(`SELECT id,label,line1,city,postal_code AS "postalCode" FROM customer_addresses WHERE user_id=$1 ORDER BY created_at DESC`,[req.user!.id]);
    res.json({success:true,data:r.rows});
  } catch(e){next(e);}
});
router.post("/me/addresses", requireAuth, requirePermission("address:write:self"), async (req,res,next) => {
  try {
    const b=addressSchema.parse(req.body);
    const r=await query(`INSERT INTO customer_addresses(user_id,label,line1,city,postal_code) VALUES($1,$2,$3,$4,$5) RETURNING id,label,line1,city,postal_code AS "postalCode"`,[req.user!.id,b.label,b.line1,b.city,b.postalCode]);
    res.status(201).json({success:true,data:r.rows[0]});
  } catch(e){next(e);}
});
export default router;
