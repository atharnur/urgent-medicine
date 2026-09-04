import { Router, Request } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { pool, query } from "../../config/db";
import { env } from "../../config/env";
import { requireAuth, requirePermission } from "../../middleware/auth";
import { initiateSslCommerz, refundSslCommerz, validateSslCommerz, ValidationResult } from "./sslcommerz";
import { ensureDeliveryForOrder } from "../delivery/service";

const router = Router();
const provider = "SSLCOMMERZ";

function publicPaymentUrl(path: string) { return `${env.paymentPublicBaseUrl.replace(/\/$/, "")}${path}`; }
function newTranId() { return `UM${crypto.randomBytes(11).toString("hex")}`.slice(0, 30); }
function safeProviderPayload(input: Record<string, unknown>) {
  const allowed = ["status", "tran_id", "val_id", "amount", "currency", "bank_tran_id", "card_type", "risk_level", "risk_title", "store_amount", "tran_date"];
  return Object.fromEntries(allowed.filter((k) => input[k] !== undefined).map((k) => [k, input[k]]));
}

async function markValidatedPayment(payload: ValidationResult, eventType: string) {
  const tranId = String(payload.tran_id ?? "");
  const valId = String(payload.val_id ?? "");
  if (!tranId || !valId) throw Object.assign(new Error("Payment callback is missing transaction identifiers."), { statusCode: 400, code: "PAYMENT_CALLBACK_INVALID" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const tx = await client.query<any>(`SELECT pt.*, o.user_id, o.total_bdt, o.payment_status AS order_payment_status
      FROM payment_transactions pt JOIN orders o ON o.id=pt.order_id
      WHERE pt.provider=$1 AND pt.provider_tran_id=$2 FOR UPDATE`, [provider, tranId]);
    if (!tx.rowCount) throw Object.assign(new Error("Payment transaction not found."), { statusCode: 404, code: "PAYMENT_NOT_FOUND" });
    const row = tx.rows[0];

    const expected = Number(row.amount_bdt);
    const received = Number(payload.amount);
    if (payload.currency !== "BDT" || !Number.isFinite(received) || Math.abs(received - expected) > 0.005) {
      await client.query(`UPDATE payment_transactions SET status='FAILED', failure_code='AMOUNT_MISMATCH', failure_message='Provider amount/currency did not match the order.', metadata=metadata || $1::jsonb, updated_at=now() WHERE id=$2`, [JSON.stringify(safeProviderPayload(payload as any)), row.id]);
      await client.query(`UPDATE orders SET payment_status='FAILED', updated_at=now() WHERE id=$1 AND payment_status <> 'PAID'`, [row.order_id]);
      await client.query("COMMIT");
      return { orderId: row.order_id, status: "FAILED" };
    }

    const valid = payload.status === "VALID" || payload.status === "VALIDATED";
    if (!valid) {
      await client.query(`UPDATE payment_transactions SET status='FAILED', failure_code='PROVIDER_NOT_VALID', failure_message='Provider validation did not return VALID.', metadata=metadata || $1::jsonb, updated_at=now() WHERE id=$2`, [JSON.stringify(safeProviderPayload(payload as any)), row.id]);
      await client.query(`UPDATE orders SET payment_status='FAILED', updated_at=now() WHERE id=$1 AND payment_status <> 'PAID'`, [row.order_id]);
      await client.query("COMMIT");
      return { orderId: row.order_id, status: "FAILED" };
    }

    await client.query(`UPDATE payment_transactions SET status='PAID', provider_validation_id=$1, provider_bank_tran_id=$2, provider_payment_method=$3,
      risk_level=$4, risk_title=$5, paid_at=COALESCE(paid_at,now()), metadata=metadata || $6::jsonb, updated_at=now() WHERE id=$7`,
      [valId, payload.bank_tran_id ?? null, payload.card_type ?? null, payload.risk_level != null ? Number(payload.risk_level) : null, payload.risk_title ?? null, JSON.stringify(safeProviderPayload(payload as any)), row.id]);
    await client.query(`UPDATE orders SET payment_status='PAID', paid_at=COALESCE(paid_at,now()), status=CASE WHEN status='PENDING_PAYMENT' THEN 'CONFIRMED' ELSE status END, updated_at=now() WHERE id=$1`, [row.order_id]);
    await client.query(`INSERT INTO order_status_history(order_id,status) SELECT $1,'CONFIRMED' WHERE NOT EXISTS (SELECT 1 FROM order_status_history WHERE order_id=$1 AND status='CONFIRMED')`, [row.order_id]);
    await client.query(`INSERT INTO payment_events(payment_transaction_id,provider,event_type,provider_event_id,payload) VALUES($1,$2,$3,$4,$5) ON CONFLICT (provider,provider_event_id) DO NOTHING`, [row.id, provider, eventType, valId || null, JSON.stringify(safeProviderPayload(payload as any))]);
    await client.query("COMMIT");
    await ensureDeliveryForOrder(row.order_id, undefined);
    return { orderId: row.order_id, status: "PAID" };
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}

async function markFailedOrCancelled(tranId: string, status: "FAILED" | "CANCELLED", message?: string) {
  await query(`UPDATE payment_transactions SET status=$1, failure_message=$2, updated_at=now() WHERE provider=$3 AND provider_tran_id=$4 AND status NOT IN ('PAID','REFUNDED','PARTIALLY_REFUNDED')`, [status, message ?? null, provider, tranId]);
  await query(`UPDATE orders o SET payment_status=$1, updated_at=now() FROM payment_transactions pt WHERE pt.order_id=o.id AND pt.provider=$2 AND pt.provider_tran_id=$3 AND o.payment_status <> 'PAID'`, [status, provider, tranId]);
}

router.post("/orders/:orderId/initiate", requireAuth, requirePermission("payment:initiate:self"), async (req,res,next) => {
  try {
    const orderId = z.string().uuid().parse(req.params.orderId);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const order = await client.query<any>(`SELECT o.id,o.user_id,o.total_bdt,o.payment_method,o.payment_status,
          u.name,u.email,u.phone,a.line1,a.city,a.postal_code AS "postalCode"
        FROM orders o JOIN users u ON u.id=o.user_id JOIN customer_addresses a ON a.id=o.address_id
        WHERE o.id=$1 AND o.user_id=$2 FOR UPDATE`, [orderId, req.user!.id]);
      if (!order.rowCount) throw Object.assign(new Error("Order not found."), { statusCode: 404, code: "NOT_FOUND" });
      const o = order.rows[0];
      if (o.payment_method !== "ONLINE") throw Object.assign(new Error("This order does not require online payment."), { statusCode: 400, code: "PAYMENT_METHOD_MISMATCH" });
      if (o.payment_status === "PAID") { await client.query("COMMIT"); return res.json({ success:true, data:{ orderId, status:"PAID" } }); }

      const pending = await client.query<any>(`SELECT * FROM payment_transactions WHERE order_id=$1 AND provider=$2 AND status IN ('PENDING','INITIATED','AUTHORIZED') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`, [orderId, provider]);
      if (pending.rowCount && pending.rows[0].metadata?.gatewayPageUrl) {
        await client.query("COMMIT");
        return res.json({ success:true, data:{ orderId, paymentTransactionId:pending.rows[0].id, status:pending.rows[0].status, gatewayUrl:pending.rows[0].metadata.gatewayPageUrl } });
      }

      const tranId = newTranId();
      const tx = await client.query<any>(`INSERT INTO payment_transactions(order_id,provider,provider_tran_id,amount_bdt,currency,status) VALUES($1,$2,$3,$4,'BDT','PENDING') RETURNING id`, [orderId, provider, tranId, o.total_bdt]);
      await client.query("COMMIT");

      const gateway = await initiateSslCommerz({
        tranId, amountBdt:Number(o.total_bdt),
        customer:{name:o.name,email:o.email,phone:o.phone},
        address:{line1:o.line1,city:o.city,postalCode:o.postalCode},
        orderId,
        successUrl:publicPaymentUrl("/api/v1/payments/sslcommerz/success"),
        failUrl:publicPaymentUrl("/api/v1/payments/sslcommerz/fail"),
        cancelUrl:publicPaymentUrl("/api/v1/payments/sslcommerz/cancel"),
        ipnUrl:publicPaymentUrl("/api/v1/payments/sslcommerz/ipn")
      });
      await query(`UPDATE payment_transactions SET status='INITIATED',provider_session_id=$1,metadata=metadata || $2::jsonb,updated_at=now() WHERE id=$3`, [gateway.sessionkey ?? null, JSON.stringify({ gatewayPageUrl: gateway.GatewayPageURL }), tx.rows[0].id]);
      await query(`UPDATE orders SET payment_provider=$1,updated_at=now() WHERE id=$2`, [provider,orderId]);
      res.json({ success:true, data:{ orderId, paymentTransactionId:tx.rows[0].id, status:"INITIATED", gatewayUrl:gateway.GatewayPageURL } });
    } catch (e) {
      try { await client.query("ROLLBACK"); } catch {}
      throw e;
    } finally { client.release(); }
  } catch(e){next(e);}
});

router.get("/orders/:orderId", requireAuth, requirePermission("payment:read:self"), async(req,res,next)=>{try{
  const orderId=z.string().uuid().parse(req.params.orderId);
  const r=await query(`SELECT pt.id AS "paymentTransactionId",pt.provider,pt.provider_tran_id AS "transactionId",pt.amount_bdt AS "amountBdt",pt.currency,pt.status,pt.provider_payment_method AS "paymentMethod",pt.failure_code AS "failureCode",pt.failure_message AS "failureMessage",pt.initiated_at AS "initiatedAt",pt.paid_at AS "paidAt"
    FROM payment_transactions pt JOIN orders o ON o.id=pt.order_id WHERE pt.order_id=$1 AND o.user_id=$2 ORDER BY pt.created_at DESC`,[orderId,req.user!.id]);
  res.json({success:true,data:r.rows});
}catch(e){next(e);}});

async function handleCallback(req: Request, res: any, type: "SUCCESS"|"FAIL"|"CANCEL"|"IPN") {
  const body = (req.body ?? {}) as Record<string, unknown>;
  try {
    if (type === "SUCCESS" || type === "IPN") {
      const valId = String(body.val_id ?? "");
      if (!valId) throw Object.assign(new Error("Missing validation id."), {statusCode:400,code:"PAYMENT_CALLBACK_INVALID"});
      const validation = await validateSslCommerz(valId);
      const result = await markValidatedPayment(validation, type);
      if (type === "IPN") return res.status(200).json({success:true,data:result});
      return res.redirect(`${env.frontendOrigin}/payment/result?status=${result.status === "PAID" ? "success" : "failed"}&orderId=${encodeURIComponent(result.orderId)}`);
    }
    const tranId=String(body.tran_id ?? "");
    if (tranId) await markFailedOrCancelled(tranId,type === "FAIL" ? "FAILED" : "CANCELLED", String(body.error ?? body.failedreason ?? "Payment was not completed."));
    return res.redirect(`${env.frontendOrigin}/payment/result?status=${type.toLowerCase()}&orderId=${encodeURIComponent(String(body.value_a ?? ""))}`);
  } catch (e) {
    if (type === "IPN") return res.status(400).json({success:false,error:{code:"PAYMENT_CALLBACK_FAILED",message:"Payment notification could not be processed."}});
    return res.redirect(`${env.frontendOrigin}/payment/result?status=failed`);
  }
}

router.post("/sslcommerz/ipn", (req,res)=>void handleCallback(req,res,"IPN"));
router.post("/sslcommerz/success", (req,res)=>void handleCallback(req,res,"SUCCESS"));
router.get("/sslcommerz/success", (req,res)=>void handleCallback(req,res,"SUCCESS"));
router.post("/sslcommerz/fail", (req,res)=>void handleCallback(req,res,"FAIL"));
router.get("/sslcommerz/fail", (req,res)=>void handleCallback(req,res,"FAIL"));
router.post("/sslcommerz/cancel", (req,res)=>void handleCallback(req,res,"CANCEL"));
router.get("/sslcommerz/cancel", (req,res)=>void handleCallback(req,res,"CANCEL"));

router.post("/admin/refunds", requireAuth, requirePermission("admin:payment:refund"), async(req,res,next)=>{
  try {
    const body=z.object({paymentTransactionId:z.string().uuid(),amountBdt:z.number().positive(),reason:z.string().trim().min(3).max(255)}).parse(req.body);
    const client=await pool.connect();
    try {
      await client.query("BEGIN");
      const tx=await client.query<any>(`SELECT pt.*,o.id AS order_id,o.total_bdt FROM payment_transactions pt JOIN orders o ON o.id=pt.order_id WHERE pt.id=$1 FOR UPDATE`,[body.paymentTransactionId]);
      if(!tx.rowCount) throw Object.assign(new Error("Payment transaction not found."),{statusCode:404,code:"PAYMENT_NOT_FOUND"});
      const row=tx.rows[0];
      if(row.status !== "PAID" && row.status !== "PARTIALLY_REFUNDED") throw Object.assign(new Error("Only paid transactions can be refunded."),{statusCode:400,code:"REFUND_NOT_ALLOWED"});
      const alreadyRefunded=await client.query<{total:string}>(`SELECT COALESCE(SUM(amount_bdt),0)::text AS total FROM refunds WHERE payment_transaction_id=$1 AND status IN ('PENDING','PROCESSING','REFUNDED')`,[row.id]);
      if(Number(body.amountBdt)+Number(alreadyRefunded.rows[0].total)>Number(row.amount_bdt)) throw Object.assign(new Error("Refund exceeds the remaining refundable amount."),{statusCode:400,code:"REFUND_EXCEEDS_PAYMENT"});
      if(!row.provider_bank_tran_id) throw Object.assign(new Error("Provider bank transaction reference is missing."),{statusCode:400,code:"REFUND_REFERENCE_MISSING"});
      const refund=await client.query<any>(`INSERT INTO refunds(payment_transaction_id,order_id,amount_bdt,reason,created_by,status) VALUES($1,$2,$3,$4,$5,'PENDING') RETURNING id`,[row.id,row.order_id,body.amountBdt,body.reason,req.user!.id]);
      await client.query("COMMIT");
      const refundTranId=newTranId();
      try {
        const result=await refundSslCommerz(row.provider_bank_tran_id,refundTranId,body.amountBdt,body.reason);
        const status=String(result.status ?? "").toLowerCase();
        const mapped=status === "success" ? "REFUNDED" : status === "processing" ? "PROCESSING" : "FAILED";
        await query(`UPDATE refunds SET status=$1,provider_refund_id=$2,failure_message=$3,updated_at=now() WHERE id=$4`,[mapped,result.refund_ref_id ?? null,mapped === "FAILED" ? String(result.errorReason ?? "Refund failed.") : null,refund.rows[0].id]);
        if(mapped === "REFUNDED") await query(`UPDATE payment_transactions SET status=CASE WHEN (SELECT COALESCE(SUM(amount_bdt),0) FROM refunds WHERE payment_transaction_id=$1 AND status='REFUNDED') >= amount_bdt THEN 'REFUNDED' ELSE 'PARTIALLY_REFUNDED' END,updated_at=now() WHERE id=$1`,[row.id]);
        return res.status(201).json({success:true,data:{refundId:refund.rows[0].id,status:mapped}});
      } catch(e) {
        await query(`UPDATE refunds SET status='FAILED',failure_message=$1,updated_at=now() WHERE id=$2`,[e instanceof Error ? e.message : "Refund request failed.",refund.rows[0].id]);
        throw e;
      }
    } catch(e){try{await client.query("ROLLBACK");}catch{} throw e;} finally{client.release();}
  }catch(e){next(e);}
});

export default router;
