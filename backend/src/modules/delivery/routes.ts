import { Router } from "express";
import { z } from "zod";
import { query } from "../../config/db";
import { operational } from "../../config/operational";
import { requireAuth, requirePermission } from "../../middleware/auth";
import { ensureDeliveryForOrder, transitionDelivery } from "./service";

const router = Router();
const statusSchema = z.object({ status: z.enum(["PICKUP_READY","PICKED_UP","OUT_FOR_DELIVERY","DELIVERED","FAILED","CANCELLED"]), note: z.string().max(500).optional() });
const locationSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), accuracyM: z.number().nonnegative().max(100000).optional() });

// Customer tracking: object-level authorization is enforced by joining the order owner.
router.get("/orders/:orderId/tracking", requireAuth, requirePermission("delivery:read:customer"), async (req,res,next)=>{ try {
  const orderId=z.string().uuid().parse(req.params.orderId);
  const d=await query<any>(`SELECT d.id,d.tracking_number AS "trackingNumber",d.status,d.estimated_delivery_at AS "estimatedDeliveryAt",d.delivered_at AS "deliveredAt",d.created_at AS "createdAt"
    FROM delivery_orders d JOIN orders o ON o.id=d.order_id WHERE d.order_id=$1 AND o.user_id=$2`,[orderId,req.user!.id]);
  if(!d.rowCount) return res.status(404).json({success:false,error:{code:"NOT_FOUND",message:"Delivery tracking not found."}});
  const events=await query(`SELECT status,note,source,created_at AS "createdAt" FROM delivery_events WHERE delivery_order_id=$1 ORDER BY created_at ASC`,[d.rows[0].id]);
  const latest=await query(`SELECT latitude,longitude,accuracy_m AS "accuracyM",recorded_at AS "recordedAt" FROM delivery_locations WHERE delivery_order_id=$1 ORDER BY recorded_at DESC LIMIT 1`,[d.rows[0].id]);
  res.json({success:true,data:{...d.rows[0],events:events.rows,latestLocation:latest.rows[0]??null}});
 } catch(e){next(e);} });

router.get("/me", requireAuth, requirePermission("delivery:read:self"), async(req,res,next)=>{try{
  const r=await query(`SELECT d.id,d.order_id AS "orderId",d.tracking_number AS "trackingNumber",d.status,d.delivery_name AS "deliveryName",d.delivery_phone AS "deliveryPhone",d.delivery_address AS "deliveryAddress",d.delivery_city AS "deliveryCity",d.delivery_postal_code AS "deliveryPostalCode",d.estimated_delivery_at AS "estimatedDeliveryAt" FROM delivery_orders d JOIN delivery_agents a ON a.id=d.assigned_agent_id WHERE a.user_id=$1 ORDER BY d.updated_at DESC`,[req.user!.id]);
  res.json({success:true,data:r.rows});
}catch(e){next(e);}});

router.patch("/:id/status", requireAuth, requirePermission("delivery:update:self"), async(req,res,next)=>{try{
  const id=z.string().uuid().parse(req.params.id); const body=statusSchema.parse(req.body);
  const owns=await query(`SELECT 1 FROM delivery_orders d JOIN delivery_agents a ON a.id=d.assigned_agent_id WHERE d.id=$1 AND a.user_id=$2`,[id,req.user!.id]);
  if(!owns.rowCount)return res.status(404).json({success:false,error:{code:"NOT_FOUND",message:"Delivery task not found."}});
  const result=await transitionDelivery(id,body.status,req.user!.id,"DELIVERY_AGENT",body.note);
  res.json({success:true,data:result});
}catch(e){next(e);}});

router.post("/:id/location", requireAuth, requirePermission("delivery:location:self"), async(req,res,next)=>{try{
  const id=z.string().uuid().parse(req.params.id); const body=locationSchema.parse(req.body);
  const agent=await query<any>(`SELECT a.id FROM delivery_agents a JOIN delivery_orders d ON d.assigned_agent_id=a.id WHERE d.id=$1 AND a.user_id=$2`,[id,req.user!.id]);
  if(!agent.rowCount)return res.status(404).json({success:false,error:{code:"NOT_FOUND",message:"Delivery task not found."}});
  await query(`INSERT INTO delivery_locations(delivery_order_id,agent_id,latitude,longitude,accuracy_m,expires_at) VALUES($1,$2,$3,$4,$5,NOW()+($6 || ' days')::interval)`,[id,agent.rows[0].id,body.latitude,body.longitude,body.accuracyM??null,operational.deliveryLocationRetentionDays]);
  res.status(201).json({success:true,data:{recorded:true}});
}catch(e){next(e);}});

// Admin operations.
router.post("/admin/orders/:orderId", requireAuth, requirePermission("admin:delivery:create"), async(req,res,next)=>{try{
  const orderId=z.string().uuid().parse(req.params.orderId); const result=await ensureDeliveryForOrder(orderId,req.user!.id); res.status(201).json({success:true,data:result});
}catch(e){next(e);}});

router.get("/admin", requireAuth, requirePermission("admin:delivery:read"), async(req,res,next)=>{try{
  const r=await query(`SELECT d.id,d.order_id AS "orderId",d.tracking_number AS "trackingNumber",d.status,d.assigned_agent_id AS "assignedAgentId",u.name AS "agentName",d.delivery_name AS "deliveryName",d.delivery_address AS "deliveryAddress",d.delivery_city AS "deliveryCity",d.updated_at AS "updatedAt" FROM delivery_orders d LEFT JOIN delivery_agents a ON a.id=d.assigned_agent_id LEFT JOIN users u ON u.id=a.user_id ORDER BY d.created_at DESC`);
  res.json({success:true,data:r.rows});
}catch(e){next(e);}});

router.post("/admin/agents", requireAuth, requirePermission("admin:delivery:assign"), async(req,res,next)=>{try{
  const userId=z.string().uuid().parse(req.body.userId);
  const r=await query<any>(`INSERT INTO delivery_agents(user_id) SELECT $1 WHERE EXISTS (SELECT 1 FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=$1 AND r.name='DELIVERY_AGENT' AND u.status='ACTIVE') ON CONFLICT(user_id) DO UPDATE SET status='ACTIVE',updated_at=now() RETURNING id,user_id AS "userId",status`,[userId]);
  if(!r.rowCount)return res.status(400).json({success:false,error:{code:"INVALID_AGENT_USER",message:"User must exist, be active, and have DELIVERY_AGENT role."}});
  res.status(201).json({success:true,data:r.rows[0]});
}catch(e){next(e);}});

router.get("/admin/agents", requireAuth, requirePermission("admin:delivery:read-agents"), async(req,res,next)=>{try{
  const r=await query(`SELECT a.id,u.id AS "userId",u.name,u.email,u.phone,a.status FROM delivery_agents a JOIN users u ON u.id=a.user_id ORDER BY u.name`);res.json({success:true,data:r.rows});
}catch(e){next(e);}});

router.post("/admin/:id/assign", requireAuth, requirePermission("admin:delivery:assign"), async(req,res,next)=>{try{
  const id=z.string().uuid().parse(req.params.id); const agentId=z.string().uuid().parse(req.body.agentId);
  const client=await (await import("../../config/db")).pool.connect();
  try { await client.query("BEGIN");
    const agent=await client.query(`SELECT id FROM delivery_agents WHERE id=$1 AND status='ACTIVE'`,[agentId]); if(!agent.rowCount) throw Object.assign(new Error("Active delivery agent not found."),{statusCode:400,code:"INVALID_AGENT"});
    const d=await client.query<any>(`SELECT id,status,order_id FROM delivery_orders WHERE id=$1 FOR UPDATE`,[id]); if(!d.rowCount) throw Object.assign(new Error("Delivery task not found."),{statusCode:404,code:"DELIVERY_NOT_FOUND"});
    if(!["PENDING_ASSIGNMENT","FAILED"].includes(d.rows[0].status)) throw Object.assign(new Error("Delivery task cannot be assigned in its current state."),{statusCode:409,code:"INVALID_DELIVERY_STATE"});
    await client.query(`UPDATE delivery_orders SET assigned_agent_id=$1,status='ASSIGNED',updated_at=now() WHERE id=$2`,[agentId,id]);
    await client.query(`INSERT INTO delivery_events(delivery_order_id,status,actor_user_id,source,note) VALUES($1,'ASSIGNED',$2,'ADMIN','Delivery agent assigned.')`,[id,req.user!.id]);
    await client.query(`UPDATE orders SET fulfillment_status='ASSIGNED',updated_at=now() WHERE id=$1`,[d.rows[0].order_id]);
    await client.query("COMMIT"); res.json({success:true,data:{deliveryId:id,assignedAgentId:agentId,status:"ASSIGNED"}});
  } catch(e){await client.query("ROLLBACK");throw e;} finally{client.release();}
}catch(e){next(e);}});

export default router;
