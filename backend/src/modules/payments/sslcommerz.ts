import { env } from "../../config/env";

export type PaymentInitInput = {
  tranId: string;
  amountBdt: number;
  customer: { name: string; email: string; phone: string };
  address: { line1: string; city: string; postalCode: string };
  successUrl: string;
  failUrl: string;
  cancelUrl: string;
  ipnUrl: string;
  orderId: string;
};

export type ValidationResult = {
  status?: string;
  tran_id?: string;
  val_id?: string;
  amount?: string;
  currency?: string;
  bank_tran_id?: string;
  card_type?: string;
  risk_level?: string;
  risk_title?: string;
  store_amount?: string;
  [key: string]: unknown;
};

function requireCredentials() {
  if (!env.sslCommerzStoreId || !env.sslCommerzStorePassword) {
    throw Object.assign(new Error("Online payment is not configured."), { statusCode: 503, code: "PAYMENT_NOT_CONFIGURED" });
  }
}

function baseUrl() {
  return env.sslCommerzSandbox ? "https://sandbox.sslcommerz.com" : "https://securepay.sslcommerz.com";
}

async function parseJson(response: Response) {
  const text = await response.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch { throw new Error("Payment provider returned an invalid response."); }
  if (!response.ok) throw new Error(`Payment provider request failed (${response.status}).`);
  return data;
}

export async function initiateSslCommerz(input: PaymentInitInput) {
  requireCredentials();
  const form = new URLSearchParams();
  form.set("store_id", env.sslCommerzStoreId);
  form.set("store_passwd", env.sslCommerzStorePassword);
  form.set("total_amount", input.amountBdt.toFixed(2));
  form.set("currency", "BDT");
  form.set("tran_id", input.tranId);
  form.set("product_category", "healthcare");
  form.set("success_url", input.successUrl);
  form.set("fail_url", input.failUrl);
  form.set("cancel_url", input.cancelUrl);
  form.set("ipn_url", input.ipnUrl);
  form.set("value_a", input.orderId);
  form.set("cus_name", input.customer.name);
  form.set("cus_email", input.customer.email);
  form.set("cus_phone", input.customer.phone);
  form.set("cus_add1", input.address.line1);
  form.set("cus_city", input.address.city);
  form.set("cus_postcode", input.address.postalCode);
  form.set("cus_country", "Bangladesh");
  form.set("ship_name", input.customer.name);
  form.set("ship_add1", input.address.line1);
  form.set("ship_city", input.address.city);
  form.set("ship_postcode", input.address.postalCode);
  form.set("ship_country", "Bangladesh");

  const response = await fetch(`${baseUrl()}/gwprocess/v4/api.php`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(env.paymentRequestTimeoutMs)
  });
  const data = await parseJson(response);
  if (data.status !== "SUCCESS" || !data.GatewayPageURL) {
    throw Object.assign(new Error(data.failedreason || "Unable to initialize online payment."), { statusCode: 502, code: "PAYMENT_INIT_FAILED" });
  }
  return data as { status: string; sessionkey?: string; GatewayPageURL: string; failedreason?: string; [key: string]: unknown };
}

export async function validateSslCommerz(valId: string): Promise<ValidationResult> {
  requireCredentials();
  const url = new URL(`${baseUrl()}/validator/api/validationserverAPI.php`);
  url.searchParams.set("val_id", valId);
  url.searchParams.set("store_id", env.sslCommerzStoreId);
  url.searchParams.set("store_passwd", env.sslCommerzStorePassword);
  url.searchParams.set("format", "json");
  const response = await fetch(url, { signal: AbortSignal.timeout(env.paymentRequestTimeoutMs) });
  return await parseJson(response);
}

export async function refundSslCommerz(bankTranId: string, refundTranId: string, amountBdt: number, reason: string) {
  requireCredentials();
  const url = new URL(`${baseUrl()}/validator/api/merchantTransIDvalidationAPI.php`);
  url.searchParams.set("bank_tran_id", bankTranId);
  url.searchParams.set("refund_trans_id", refundTranId);
  url.searchParams.set("refund_amount", amountBdt.toFixed(2));
  url.searchParams.set("refund_remarks", reason.slice(0, 255));
  url.searchParams.set("store_id", env.sslCommerzStoreId);
  url.searchParams.set("store_passwd", env.sslCommerzStorePassword);
  url.searchParams.set("v", "1");
  url.searchParams.set("format", "json");
  const response = await fetch(url, { signal: AbortSignal.timeout(env.paymentRequestTimeoutMs) });
  return await parseJson(response);
}
