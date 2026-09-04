"use client";
import { useEffect, useState } from "react";
import { api } from "../../lib/api";

type Prescription = { id:string; status:string; issuedAt?:string; expiresAt?:string; notes?:string; rejectionReason?:string; createdAt:string; files:any[]; items:any[] };

export default function Prescriptions(){
  const [items,setItems]=useState<Prescription[]>([]); const [error,setError]=useState(""); const [file,setFile]=useState<File|null>(null); const [busy,setBusy]=useState(false);
  async function load(){ try{ const x=await api<any>("/prescriptions"); setItems(x.data||[]);}catch(e:any){setError(e.message);} }
  useEffect(()=>{load()},[]);
  async function create(){ setBusy(true); setError(""); try{ await api<any>("/prescriptions",{method:"POST",body:JSON.stringify({})}); await load(); }catch(e:any){setError(e.message)}finally{setBusy(false)} }
  async function upload(id:string){ if(!file)return; setBusy(true); setError(""); try{const fd=new FormData(); fd.append("file",file); await api<any>(`/prescriptions/${id}/files`,{method:"POST",body:fd}); setFile(null); await load();}catch(e:any){setError(e.message)}finally{setBusy(false)} }
  return <main className="container"><div className="card"><h1>Prescriptions</h1><p className="muted">Upload a prescription for secure review. Prescription-required medicines cannot be ordered until an authorized reviewer approves the prescription.</p><button className="btn primary" disabled={busy} onClick={create}>Create Prescription Record</button>{error&&<p className="error">{error}</p>}</div>{items.map(p=><div className="card" key={p.id}><h2>{p.status.replaceAll("_"," ")}</h2><p className="muted">ID: {p.id}</p>{p.rejectionReason&&<p className="error">{p.rejectionReason}</p>}<div><input className="input" type="file" accept="image/jpeg,image/png,application/pdf" onChange={e=>setFile(e.target.files?.[0]??null)} /><button className="btn" disabled={!file||busy||p.status!=="PENDING_REVIEW"} onClick={()=>upload(p.id)}>Upload</button></div><ul>{(p.files||[]).map((f:any)=><li key={f.id}>{f.filename} — {f.byteSize} bytes</li>)}</ul></div>)}</main>
}
