import crypto from "node:crypto";
import { pool } from "../../config/db";

export function newTrackingNumber() {
  return `UMD-${crypto.randomBytes(7).toString("hex").toUpperCase()}`;
}

export async function ensureDeliveryForOrder(orderId: string, actorUserId?: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const order = await client.query<any>(`SELECT o.id,o.user_id,o.status,o.payment_status,
      u.name AS customer_name,u.phone AS customer_phone,
      a.line1,a.city,a.postal_code
      FROM orders o JOIN users u ON u.id=o.user_id JOIN customer_addresses a ON a.id=o.address_id
      WHERE o.id=$1 FOR UPDATE`, [orderId]);
    if (!order.rowCount) throw Object.assign(new Error("Order not found."), { statusCode: 404, code: "ORDER_NOT_FOUND" });
    const o = order.rows[0];
    if (o.status !== "CONFIRMED" || !["PAID","PENDING"].includes(o.payment_status)) {
      throw Object.assign(new Error("Order is not eligible for fulfillment."), { statusCode: 409, code: "ORDER_NOT_READY_FOR_FULFILLMENT" });
    }
    const existing = await client.query(`SELECT id,tracking_number AS "trackingNumber",status FROM delivery_orders WHERE order_id=$1 FOR UPDATE`, [orderId]);
    if (existing.rowCount) {
      await client.query("COMMIT");
      return existing.rows[0];
    }
    const tracking = newTrackingNumber();
    const delivery = await client.query<any>(`INSERT INTO delivery_orders(
      order_id,tracking_number,status,delivery_name,delivery_phone,delivery_address,delivery_city,delivery_postal_code
    ) VALUES($1,$2,'PENDING_ASSIGNMENT',$3,$4,$5,$6,$7) RETURNING id,tracking_number AS "trackingNumber",status`,
      [orderId, tracking, o.customer_name, o.customer_phone, o.line1, o.city, o.postal_code]);
    await client.query(`UPDATE orders SET fulfillment_status='PENDING_FULFILLMENT',updated_at=now() WHERE id=$1`, [orderId]);
    await client.query(`INSERT INTO delivery_events(delivery_order_id,status,actor_user_id,source,note) VALUES($1,'PENDING_ASSIGNMENT',$2,'SYSTEM','Delivery task created after order confirmation.')`, [delivery.rows[0].id, actorUserId ?? null]);
    await client.query("COMMIT");
    return delivery.rows[0];
  } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}

export const allowedTransitions: Record<string, string[]> = {
  PENDING_ASSIGNMENT: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["PICKUP_READY", "CANCELLED"],
  PICKUP_READY: ["PICKED_UP", "FAILED", "CANCELLED"],
  PICKED_UP: ["OUT_FOR_DELIVERY", "FAILED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED"],
  DELIVERED: [],
  FAILED: ["ASSIGNED", "CANCELLED"],
  CANCELLED: []
};

export async function transitionDelivery(deliveryId: string, nextStatus: string, actorUserId: string, source: "ADMIN"|"DELIVERY_AGENT", note?: string) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<any>(`SELECT d.*,o.id AS order_id FROM delivery_orders d JOIN orders o ON o.id=d.order_id WHERE d.id=$1 FOR UPDATE`, [deliveryId]);
    if (!current.rowCount) throw Object.assign(new Error("Delivery task not found."), { statusCode: 404, code: "DELIVERY_NOT_FOUND" });
    const row = current.rows[0];
    if (!(allowedTransitions[row.status] ?? []).includes(nextStatus)) {
      throw Object.assign(new Error(`Invalid delivery transition from ${row.status} to ${nextStatus}.`), { statusCode: 409, code: "INVALID_DELIVERY_TRANSITION" });
    }
    const deliveredAt = nextStatus === "DELIVERED" ? "now()" : "delivered_at";
    await client.query(`UPDATE delivery_orders SET status=$1,delivered_at=${deliveredAt},failure_reason=CASE WHEN $1='FAILED' THEN $2 ELSE failure_reason END,updated_at=now() WHERE id=$3`, [nextStatus, note ?? null, deliveryId]);
    const fulfillment = nextStatus === "DELIVERED" ? "DELIVERED" : nextStatus === "FAILED" ? "DELIVERY_FAILED" : nextStatus;
    await client.query(`UPDATE orders SET fulfillment_status=$1,status=CASE WHEN $1='DELIVERED' THEN 'DELIVERED' ELSE status END,updated_at=now() WHERE id=$2`, [fulfillment, row.order_id]);
    await client.query(`INSERT INTO delivery_events(delivery_order_id,status,actor_user_id,source,note) VALUES($1,$2,$3,$4,$5)`, [deliveryId,nextStatus,actorUserId,source,note ?? null]);
    await client.query("INSERT INTO order_status_history(order_id,status) VALUES($1,$2)", [row.order_id, nextStatus === "DELIVERED" ? "DELIVERED" : nextStatus]);
    await client.query("COMMIT");
    return { deliveryId, orderId: row.order_id, status: nextStatus };
  } catch(e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); }
}
