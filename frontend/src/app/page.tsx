import Link from "next/link";

const features=[
  ["01","Find the right medicine","Search by brand, generic name, ingredient, manufacturer, strength or dosage form."],
  ["02","Review availability","See medicine details and proceed through the verified availability and ordering workflow."],
  ["03","Order with confidence","Prescription-aware checkout, secure payment flow and live delivery tracking."],
];

export default function Home(){return <main>
  <section className="hero"><div className="container hero-grid">
    <div><div className="eyebrow">● Built for urgent medicine needs</div><h1>Find medicine.<br/><span style={{color:"var(--brand)"}}>Get it moving.</span></h1><p>Urgent Medicine is designed to make medicine discovery, prescription review, secure checkout and delivery easier for customers in Bangladesh.</p><div className="hero-actions"><Link className="btn primary" href="/medicines">Search medicines →</Link><Link className="btn ghost" href="/signup">Create free account</Link></div>
      <div className="stat-grid"><div className="stat"><b>24/7</b><span className="muted">Search access</span></div><div className="stat"><b>BDT 220</b><span className="muted">Fixed delivery charge</span></div><div className="stat"><b>Secure</b><span className="muted">Checkout flow</span></div></div>
    </div>
    <div className="hero-panel"><div className="mock"><div className="mock-search">⌕&nbsp; Search paracetamol, amoxicillin, insulin…</div><div className="mock-row"><div><div className="mock-title">Sample Medicine</div><div className="mock-sub">Strength • dosage form • manufacturer</div></div><span className="pill pill-green">Verified</span></div><div className="mock-row"><div><div className="mock-title">Prescription-aware checkout</div><div className="mock-sub">Upload and review securely when required</div></div><span>✓</span></div><div className="mock-row"><div><div className="mock-title">Delivery tracking</div><div className="mock-sub">Order status and latest delivery events</div></div><span>→</span></div></div></div>
  </div></section>
  <section className="container"><div className="section-title"><div><h2>One journey, designed end to end</h2><p>Every major customer action has a clear place in the experience.</p></div><Link className="link" href="/dashboard">Open customer dashboard →</Link></div><div className="grid">{features.map(([n,t,p])=><div className="card feature" key={n}><div className="feature-icon">{n}</div><h3>{t}</h3><p>{p}</p></div>)}</div></section>
  <section className="container"><div className="section-title"><div><h2>Built around real operational workflows</h2><p>Authentication, prescriptions, payment, order fulfillment and delivery are represented in the application structure.</p></div></div><div className="grid-2"><div className="card card-soft"><span className="pill pill-green">Customer</span><h3 style={{marginTop:14}}>A calmer checkout</h3><p className="muted">Save addresses, review approved prescriptions where applicable, choose online payment or cash on delivery, and see the backend-calculated BDT 220 delivery charge before confirming.</p><Link className="btn secondary btn-sm" href="/checkout">View checkout →</Link></div><div className="card card-soft"><span className="pill">Operations</span><h3 style={{marginTop:14}}>Ready for the service layer</h3><p className="muted">The frontend is structured around the production API surface rather than a static demo dataset, with customer, delivery and admin routes already separated by role.</p><Link className="btn ghost btn-sm" href="/login">Sign in →</Link></div></div></section>
  <footer className="footer"><div className="container row"><span>© Urgent Medicine</span><span>Medicine discovery • Secure ordering • Delivery</span></div></footer>
</main>}
