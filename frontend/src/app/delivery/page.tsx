"use client";
import {useEffect,useState} from "react";
import {api} from "../../lib/api";
const next:Record<string,string[]>={ASSIGNED:["PICKUP_READY"],PICKUP_READY:["PICKED_UP"],PICKED_UP:["OUT_FOR_DELIVERY"],OUT_FOR_DELIVERY:["DELIVERED","FAILED"],FAILED:["ASSIGNED"]};
export default function Delivery(){const[data,setData]=useState<any[]>([]);const[error,setError]=useState("");
 const load=()=>api<any>("/delivery/me").then(x=>setData(x.data)).catch(e=>setError(e.message));useEffect(()=>{load()},[]);
 async function update(id:string,status:string){try{await api(`/delivery/${id}/status`,{method:"PATCH",body:JSON.stringify({status})});await load()}catch(e:any){setError(e.message)}}
 async function locate(id:string){navigator.geolocation?.getCurrentPosition(async pos=>{try{await api(`/delivery/${id}/location`,{method:"POST",body:JSON.stringify({latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracyM:pos.coords.accuracy})})}catch(e:any){setError(e.message)}},()=>setError("Location permission is required to send a delivery update."));}
 return <main className="container"><div className="card"><h1>Delivery Portal</h1>{error&&<p className="error">{error}</p>}{!data.length&&<p>No assigned delivery tasks.</p>}{data.map(d=><div className="card" key={d.id}><h2>#{d.trackingNumber}</h2><p>{d.deliveryName} — {d.deliveryPhone}</p><p>{d.deliveryAddress}, {d.deliveryCity} {d.deliveryPostalCode}</p><p><b>Status:</b> {d.status}</p><div>{(next[d.status]||[]).map(s=><button className="btn primary" style={{marginRight:8}} key={s} onClick={()=>update(d.id,s)}>{s.replaceAll("_"," ")}</button>)}{d.status==="OUT_FOR_DELIVERY"&&<button className="btn" onClick={()=>locate(d.id)}>Send Location</button>}</div></div>)}</div></main>}
