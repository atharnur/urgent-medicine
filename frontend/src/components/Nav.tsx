"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav(){
  const path=usePathname();
  const active=(href:string)=>path===href||path.startsWith(href+"/");
  return <>
    <div className="topbar"><div className="container topbar-inner"><span>Trusted medicine discovery & delivery platform</span><span>Secure checkout • Prescription-aware ordering</span></div></div>
    <nav className="nav"><div className="container nav-inner">
      <Link href="/" className="brand"><span className="brand-mark">UM</span><span>Urgent Medicine</span></Link>
      <div className="navlinks">
        {[["/medicines","Medicines"],["/orders","Orders"],["/prescriptions","Prescriptions"],["/dashboard","Dashboard"]].map(([href,label])=><Link key={href} href={href} style={active(href)?{color:"var(--brand)",background:"var(--brand-soft)"}:undefined}>{label}</Link>)}
      </div>
      <div className="nav-actions"><Link className="btn ghost btn-sm" href="/login">Login</Link><Link className="btn primary btn-sm" href="/signup">Create account</Link></div>
      <div className="mobile-nav"><Link className="btn ghost btn-sm" href="/medicines">Search</Link><Link className="btn primary btn-sm" href="/dashboard">Account</Link></div>
    </div></nav>
  </>;
}
