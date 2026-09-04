"use client";
import {useEffect,useState} from "react"; import Link from "next/link"; import {api} from "../../lib/api";
export default function Orders(){const[data,setData]=useState<any[]>([]);useEffect(()=>{api<any>("/orders").then(x=>setData(x.data)).catch(()=>{})},[]);return <main className="container"><div className="card"><h1>Orders</h1>{data.map(o=><Link className="card" style={{display:"block",margin:"10px 0"}} href={`/orders/${o.id}`} key={o.id}><b>#{o.id.slice(0,8)}</b><p>{o.status}</p><p>BDT {o.totalBdt} (delivery BDT {o.deliveryChargeBdt})</p></Link>)}</div></main>}
