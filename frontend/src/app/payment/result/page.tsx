"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {api} from "../../../lib/api";

export default function PaymentResult(){
 const [status,setStatus]=useState<string|null>(null); const [orderId,setOrderId]=useState<string|null>(null); const [payment,setPayment]=useState<any[]>([]);
 useEffect(()=>{const q=new URLSearchParams(window.location.search);const s=q.get("status");const id=q.get("orderId");setStatus(s);setOrderId(id);if(id) api<any>(`/payments/orders/${id}`).then(x=>setPayment(x.data)).catch(()=>{})},[]);
 const latest=payment[0];
 return <main className="container"><div className="card"><h1>{status==="success"?"Payment successful":status==="cancel"?"Payment cancelled":"Payment update"}</h1><p>{status==="success"?"Your payment has been verified by the payment provider.":status==="cancel"?"The payment was cancelled. You can retry from the order page.":"The payment was not completed successfully. If money was debited, please wait for provider reconciliation before retrying."}</p>{orderId&&<p>Order ID: {orderId}</p>}{latest&&<><p>Payment status: <b>{latest.status}</b></p><p>Amount: BDT {latest.amountBdt}</p></>}<Link className="btn primary" href={orderId?`/orders/${orderId}`:"/orders"}>View order</Link></div></main>
}
