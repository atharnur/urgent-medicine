"use client";
import {useEffect,useState} from "react";
import {useParams} from "next/navigation";
import {api} from "../../../lib/api";

const labels:Record<string,string>={PENDING_ASSIGNMENT:"Preparing delivery",ASSIGNED:"Delivery agent assigned",PICKUP_READY:"Ready for pickup",PICKED_UP:"Picked up",OUT_FOR_DELIVERY:"Out for delivery",DELIVERED:"Delivered",FAILED:"Delivery failed",CANCELLED:"Cancelled"};
export default function Order(){
 const p=useParams(); const[o,setO]=useState<any>(); const[t,setT]=useState<any>(); const[error,setError]=useState("");
 useEffect(()=>{let timer:any; const load=()=>Promise.all([api<any>(`/orders/${p.id}`),api<any>(`/delivery/orders/${p.id}/tracking`)]).then(([a,b])=>{setO(a.data);setT(b.data)}).catch((e:any)=>setError(e.message)); load(); timer=setInterval(load,15000); return()=>clearInterval(timer)},[p.id]);
 if(error)return <main className="container"><div className="card"><p className="error">{error}</p></div></main>;
 if(!o||!t)return <main className="container">Loading...</main>;
 return <main className="container"><div className="card"><h1>Order #{o.id.slice(0,8)}</h1><p><b>Order status:</b> {o.status}</p><p><b>Payment:</b> {o.paymentStatus}</p><p>Subtotal: BDT {o.subtotalBdt}</p><p>Delivery charge: BDT {o.deliveryChargeBdt}</p><p><b>Total: BDT {o.totalBdt}</b></p></div>
 <div className="card"><h2>Delivery Tracking</h2><p><b>Tracking number:</b> {t.trackingNumber}</p><p><b>Current status:</b> {labels[t.status]??t.status}</p>{t.estimatedDeliveryAt&&<p>Estimated delivery: {new Date(t.estimatedDeliveryAt).toLocaleString()}</p>}
 <div>{t.events.map((e:any,i:number)=><div key={i} style={{padding:"10px 0",borderBottom:"1px solid #eee"}}><b>{labels[e.status]??e.status}</b><div className="muted">{new Date(e.createdAt).toLocaleString()}</div>{e.note&&<div>{e.note}</div>}</div>)}</div>
 {t.latestLocation&&t.status==="OUT_FOR_DELIVERY"?<p className="muted">Latest courier location received at {new Date(t.latestLocation.recordedAt).toLocaleTimeString()}.</p>:null}
 </div></main>
}
