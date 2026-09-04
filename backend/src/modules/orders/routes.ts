import { Router } from "express";
import { z } from "zod";
import { pool } from "../../config/db";
import { env } from "../../config/env";
import { requireAuth, requirePermission } from "../../middleware/auth";
import { ensureDeliveryForOrder } from "../delivery/service";

const router=Router();
const createSchema=z.object({addressId:z.string().uuid(),paymentMethod:z.enum(["COD","ONLINE"]).default("COD"),prescriptionId:z.string().uuid().optional()});

router.post("/",requireAuth,requirePermission("order:create:self"),async(req,res,next)=>{
  const client=await pool.connect();
  try{
    const body=createSchema.parse(req.body);
    await client.query("BEGIN");
    const cart=await client.query<{product_id:string;quantity:number;unit_price:number;prescription_required:boolean}>( 
      `SELECT ci.product_id,ci.quantity,COALESCE(p.base_price_bdt,0) AS unit_price,p.prescription_required
       FROM cart_items ci JOIN drug_products p ON p.id=ci.product_id
       WHERE ci.user_id=$1 FOR UPDATE`,[req.user!.id]);
    if(!cart.rowCount) throw Object.assign(new Error("Cart is empty"),{statusCode:400,code:"EMPTY_CART"});
    const address=await client.query(`SELECT id FROM customer_addresses WHERE id=$1 AND user_id=$2`,[body.addressId,req.user!.id]);
    if(!address.rowCount) throw Object.assign(new Error("Invalid address"),{statusCode:400,code:"INVALID_ADDRESS"});
    const prescriptionRequired = cart.rows.some((r) => r.prescription_required);
    if (prescriptionRequired) {
      if (!body.prescriptionId) throw Object.assign(new Error("An approved prescription is required for one or more medicines in the cart."), { statusCode: 400, code: "PRESCRIPTION_REQUIRED" });
      const prescription = await client.query(`SELECT id,status,expires_at AS "expiresAt" FROM prescriptions WHERE id=$1 AND customer_id=$2 FOR SHARE`, [body.prescriptionId, req.user!.id]);
      if (!prescription.rowCount || prescription.rows[0].status !== "APPROVED") throw Object.assign(new Error("The selected prescription is not approved."), { statusCode: 400, code: "PRESCRIPTION_NOT_APPROVED" });
      if (prescription.rows[0].expiresAt && new Date(prescription.rows[0].expiresAt) <= new Date()) throw Object.assign(new Error("The selected prescription has expired."), { statusCode: 400, code: "PRESCRIPTION_EXPIRED" });
    }
    const subtotal=cart.rows.reduce((s,r)=>s+Number(r.unit_price)*Number(r.quantity),0);
    // SECURITY: delivery charge is calculated server-side. Frontend cannot override it.
    const deliveryCharge=env.deliveryChargeBdt;
    const total=subtotal+deliveryCharge;
    const order=await client.query<{id:string}>(
      `INSERT INTO orders(user_id,address_id,prescription_id,subtotal_bdt,delivery_charge_bdt,total_bdt,payment_method,status)
       VALUES($1,$2,$3,$4,$5,$6,$7,CASE WHEN $7='COD' THEN 'CONFIRMED' ELSE 'PENDING_PAYMENT' END) RETURNING id`,
      [req.user!.id,body.addressId,body.prescriptionId ?? null,subtotal,deliveryCharge,total,body.paymentMethod]);
    for(const item of cart.rows) await client.query(`INSERT INTO order_items(order_id,product_id,quantity,unit_price_bdt) VALUES($1,$2,$3,$4)`,[order.rows[0].id,item.product_id,item.quantity,item.unit_price]);
    await client.query(`INSERT INTO order_status_history(order_id,status) VALUES($1,$2)`,[order.rows[0].id, body.paymentMethod === 'COD' ? 'CONFIRMED' : 'PENDING_PAYMENT']);
    await client.query(`DELETE FROM cart_items WHERE user_id=$1`,[req.user!.id]);
    await client.query("COMMIT");
    if (body.paymentMethod === "COD") await ensureDeliveryForOrder(order.rows[0].id, req.user!.id);
    res.status(201).json({success:true,data:{orderId:order.rows[0].id,subtotalBdt:subtotal,deliveryChargeBdt:deliveryCharge,totalBdt:total,paymentMethod:body.paymentMethod,paymentStatus:body.paymentMethod === "COD" ? "PAID_ON_DELIVERY" : "PENDING"}});
  }catch(e){await client.query("ROLLBACK");next(e);}finally{client.release();}
});
router.get("/",requireAuth,requirePermission("order:read:self"),async(req,res,next)=>{try{
  const r=await pool.query(`SELECT id,subtotal_bdt AS "subtotalBdt",delivery_charge_bdt AS "deliveryChargeBdt",total_bdt AS "totalBdt",status,payment_method AS "paymentMethod",payment_status AS "paymentStatus",paid_at AS "paidAt",prescription_id AS "prescriptionId",fulfillment_status AS "fulfillmentStatus",created_at AS "createdAt" FROM orders WHERE user_id=$1 ORDER BY created_at DESC`,[req.user!.id]);
  res.json({success:true,data:r.rows});
}catch(e){next(e);}});
router.get("/:id",requireAuth,requirePermission("order:read:self"),async(req,res,next)=>{try{
  const r=await pool.query(`SELECT id,subtotal_bdt AS "subtotalBdt",delivery_charge_bdt AS "deliveryChargeBdt",total_bdt AS "totalBdt",status,payment_method AS "paymentMethod",payment_status AS "paymentStatus",paid_at AS "paidAt",prescription_id AS "prescriptionId",fulfillment_status AS "fulfillmentStatus",created_at AS "createdAt" FROM orders WHERE id=$1 AND user_id=$2`,[req.params.id,req.user!.id]);
  if(!r.rowCount)return res.status(404).json({success:false,error:{code:"NOT_FOUND",message:"Order not found."}});
  res.json({success:true,data:r.rows[0]});
}catch(e){next(e);}});
export default router;
