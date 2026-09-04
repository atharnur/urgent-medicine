import "dotenv/config";

const api = process.env.GO_LIVE_API_URL ?? process.argv.find(a => a.startsWith("--api="))?.slice(6);
if (!api) {
  console.error("Usage: GO_LIVE_API_URL=https://api.example.com npm run go-live:preflight");
  process.exit(2);
}

const base = api.replace(/\/$/, "");
let failed = false;
async function check(name: string, url: string, options: RequestInit = {}) {
  try {
    const r = await fetch(url, { ...options, signal: AbortSignal.timeout(15000) });
    const text = await r.text();
    const ok = r.ok;
    console.log(`${ok ? "PASS" : "FAIL"} ${name} [${r.status}]${text ? ` ${text.slice(0, 180)}` : ""}`);
    if (!ok) failed = true;
    return ok;
  } catch (e) {
    failed = true;
    console.log(`FAIL ${name} ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

await check("API health", `${base}/health`);
await check("API readiness", `${base}/ready`);
await check("API version", `${base}/version`);

const ocl = process.env.OCL_BASE_URL ?? "https://tr.ocl.dghs.gov.bd";
await check("DGHS/OCL connectivity", ocl);

const sslBase = process.env.SSLCOMMERZ_SANDBOX === "false" ? "https://securepay.sslcommerz.com" : "https://sandbox.sslcommerz.com";
await check("SSLCOMMERZ TLS/connectivity", `${sslBase}/`);

if (process.env.GO_LIVE_REQUIRE_PROVIDERS === "true") {
  const provider = process.env.VERIFICATION_PROVIDER ?? "";
  if (!["resend", "twilio", "resend-twilio"].includes(provider)) {
    console.log(`FAIL Verification provider configured: ${provider || "missing"}`); failed = true;
  } else console.log(`PASS Verification provider configured: ${provider}`);
  if (provider === "resend" || provider === "resend-twilio") {
    if (!process.env.RESEND_API_KEY || !process.env.VERIFICATION_FROM_EMAIL) { console.log("FAIL Resend credentials/sender configured"); failed = true; }
    else console.log("PASS Resend credentials/sender configured");
  }
  if (provider === "twilio" || provider === "resend-twilio") {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_FROM_PHONE) { console.log("FAIL Twilio credentials/sender configured"); failed = true; }
    else console.log("PASS Twilio credentials/sender configured");
  }
  if (!process.env.SSLCOMMERZ_STORE_ID || !process.env.SSLCOMMERZ_STORE_PASSWORD) { console.log("FAIL SSLCOMMERZ credentials configured"); failed = true; }
  else console.log("PASS SSLCOMMERZ credentials configured");
}

console.log(failed ? "GO-LIVE PREFLIGHT: FAILED" : "GO-LIVE PREFLIGHT: PASSED");
process.exit(failed ? 1 : 0);
