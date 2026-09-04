import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  databaseUrl: required("DATABASE_URL"),
  frontendOrigin: required("FRONTEND_ORIGIN"),
  sessionCookieName: process.env.SESSION_COOKIE_NAME ?? "urgent_medicine_session",
  sessionTtlDays: Number(process.env.SESSION_TTL_DAYS ?? 7),
  deliveryChargeBdt: 220,
  authPepper: required("AUTH_PEPPER"),
  verificationProvider: process.env.VERIFICATION_PROVIDER ?? "console",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  verificationFromEmail: process.env.VERIFICATION_FROM_EMAIL ?? "",
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  twilioFromPhone: process.env.TWILIO_FROM_PHONE ?? "",
  verificationRequestTimeoutMs: Number(process.env.VERIFICATION_REQUEST_TIMEOUT_MS ?? 15000),
  cookieSameSite: (process.env.COOKIE_SAME_SITE ?? "lax") as "lax" | "strict" | "none",
  csrfCookieName: process.env.CSRF_COOKIE_NAME ?? "urgent_medicine_csrf",
  oclBaseUrl: process.env.OCL_BASE_URL ?? "https://tr.ocl.dghs.gov.bd",
  oclCollectionPath: process.env.OCL_COLLECTION_PATH ?? "/orgs/MoHFW/collections/dgda-registered-drugs-valueset/",
  oclApiToken: process.env.OCL_API_TOKEN ?? "",
  oclPageSize: Number(process.env.OCL_PAGE_SIZE ?? 250),
  catalogMaxRecords: Number(process.env.CATALOG_MAX_RECORDS ?? 100000),
  catalogRequestTimeoutMs: Number(process.env.CATALOG_REQUEST_TIMEOUT_MS ?? 30000),
  paymentProvider: process.env.PAYMENT_PROVIDER ?? "sslcommerz",
  sslCommerzSandbox: (process.env.SSLCOMMERZ_SANDBOX ?? "true").toLowerCase() === "true",
  sslCommerzStoreId: process.env.SSLCOMMERZ_STORE_ID ?? "",
  sslCommerzStorePassword: process.env.SSLCOMMERZ_STORE_PASSWORD ?? "",
  paymentPublicBaseUrl: process.env.PAYMENT_PUBLIC_BASE_URL ?? "http://localhost:4000",
  paymentRequestTimeoutMs: Number(process.env.PAYMENT_REQUEST_TIMEOUT_MS ?? 30000),
  logLevel: process.env.LOG_LEVEL ?? "info",
  corsMaxAgeSeconds: Number(process.env.CORS_MAX_AGE_SECONDS ?? 600)
};
