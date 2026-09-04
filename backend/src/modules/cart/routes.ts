import { Router } from "express";
import { z } from "zod";
import { query } from "../../config/db";
import { requireAuth, requirePermission } from "../../middleware/auth";

const router=Router();
const itemSchema=z.object({productId:z.string().uuid(),quantity:z.number().int().min(1).max(99)});
router.get("/",requireAuth,requirePermission("cart:read:self"),async(req,res,next)=>{try{
  const r=await query(`SELECT ci.id,ci.product_id AS "productId",ci.quantity,p.trade_name AS "tradeName",p.strength,p.dosage_form AS "dosageForm",p.base_price_bdt AS "unitPriceBdt" FROM cart_items ci JOIN drug_products p ON p.id=ci.product_id WHERE ci.user_id=$1 ORDER BY ci.created_at`,[req.user!.id]);
  res.json({success:true,data:r.rows});
}catch(e){next(e);}});
router.post("/items",requireAuth,requirePermission("cart:write:self"),async(req,res,next)=>{try{
  const b=itemSchema.parse(req.body);
  const p=await query(`SELECT id FROM drug_products WHERE id=$1 AND status='ACTIVE'`,[b.productId]);
  if(!p.rowCount)return res.status(404).json({success:false,error:{code:"NOT_FOUND",message:"Medicine not found."}});
  const r=await query(`INSERT INTO cart_items(user_id,product_id,quantity) VALUES($1,$2,$3) ON CONFLICT(user_id,product_id) DO UPDATE SET quantity=cart_items.quantity+EXCLUDED.quantity RETURNING id,product_id AS "productId",quantity`,[req.user!.id,b.productId,b.quantity]);
  res.status(201).json({success:true,data:r.rows[0]});
}catch(e){next(e);}});
export default router;
