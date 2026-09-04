import { env } from "./env";

export const operational = {
  sessionRefreshWindowMinutes: 30,
  deliveryLocationRetentionDays: 30,
  auditLogRetentionDays: 365,
  gracefulShutdownMs: 10000,
  isProduction: env.nodeEnv === "production",
};

export function assertProductionConfig() {
  if (env.nodeEnv !== "production") return;
  const errors: string[] = [];
  if (!env.frontendOrigin.startsWith("https://")) errors.push("FRONTEND_ORIGIN must use HTTPS in production.");
  if (env.paymentPublicBaseUrl.startsWith("http://")) errors.push("PAYMENT_PUBLIC_BASE_URL must use HTTPS in production.");
  if (env.verificationProvider !== "resend-twilio") errors.push("VERIFICATION_PROVIDER must be resend-twilio in production because signup requires email + phone verification and password reset requires email.");
  if (["resend", "resend-twilio"].includes(env.verificationProvider) && (!env.resendApiKey || !env.verificationFromEmail)) errors.push("Resend API key and verification sender are required for email delivery.");
  if (["twilio", "resend-twilio"].includes(env.verificationProvider) && (!env.twilioAccountSid || !env.twilioAuthToken || !env.twilioFromPhone)) errors.push("Twilio credentials and sender phone are required for SMS delivery.");
  if (env.cookieSameSite === "none" && !env.frontendOrigin.startsWith("https://")) errors.push("SameSite=None requires HTTPS frontend origin.");
  if (env.authPepper.length < 32) errors.push("AUTH_PEPPER must be at least 32 characters in production.");
  if (env.sslCommerzStoreId === "" || env.sslCommerzStorePassword === "") errors.push("SSLCOMMERZ credentials are required when payment is enabled.");
  if (errors.length) throw new Error(`Production configuration invalid: ${errors.join(" ")}`);
}
