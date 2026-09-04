import { env } from "../../config/env";

export interface VerificationDelivery {
  sendVerification(input: { channel: "EMAIL" | "PHONE"; destination: string; code: string }): Promise<void>;
  sendPasswordReset(input: { destination: string; token: string }): Promise<void>;
}

class ConsoleVerificationDelivery implements VerificationDelivery {
  async sendVerification(input: { channel: "EMAIL" | "PHONE"; destination: string; code: string }) {
    console.log(`[AUTH DELIVERY][${input.channel}] verification code for ${input.destination}: ${input.code}`);
  }
  async sendPasswordReset(input: { destination: string; token: string }) {
    console.log(`[AUTH DELIVERY][PASSWORD RESET] reset token for ${input.destination}: ${input.token}`);
  }
}

async function assertOk(response: Response, provider: string) {
  if (response.ok) return;
  const text = await response.text().catch(() => "");
  throw Object.assign(new Error(`${provider} delivery failed (${response.status}).`), {
    statusCode: 503,
    code: "VERIFICATION_PROVIDER_UNAVAILABLE",
    providerResponse: text.slice(0, 500)
  });
}

class ResendDelivery implements VerificationDelivery {
  private async email(to: string, subject: string, html: string) {
    if (!env.resendApiKey || !env.verificationFromEmail) throw Object.assign(new Error("Resend is not configured."), { statusCode: 503, code: "VERIFICATION_PROVIDER_UNAVAILABLE" });
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.verificationFromEmail, to: [to], subject, html }),
      signal: AbortSignal.timeout(env.verificationRequestTimeoutMs)
    });
    await assertOk(response, "Resend");
  }
  async sendVerification(input: { channel: "EMAIL" | "PHONE"; destination: string; code: string }) {
    if (input.channel !== "EMAIL") throw Object.assign(new Error("This verification provider only supports email delivery."), { statusCode: 503, code: "VERIFICATION_CHANNEL_UNAVAILABLE" });
    await this.email(input.destination, "Urgent Medicine verification code", `<p>Your verification code is <strong>${input.code}</strong>.</p><p>It expires shortly. If you did not request this, ignore this message.</p>`);
  }
  async sendPasswordReset(input: { destination: string; token: string }) {
    const link = `${env.frontendOrigin.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(input.token)}`;
    await this.email(input.destination, "Reset your Urgent Medicine password", `<p>Use the following link to reset your password:</p><p><a href="${link}">Reset password</a></p><p>This link expires shortly. If you did not request it, ignore this message.</p>`);
  }
}

class TwilioSmsDelivery implements VerificationDelivery {
  private async sms(to: string, body: string) {
    if (!env.twilioAccountSid || !env.twilioAuthToken || !env.twilioFromPhone) throw Object.assign(new Error("Twilio SMS is not configured."), { statusCode: 503, code: "VERIFICATION_PROVIDER_UNAVAILABLE" });
    const auth = Buffer.from(`${env.twilioAccountSid}:${env.twilioAuthToken}`).toString("base64");
    const form = new URLSearchParams({ To: to, From: env.twilioFromPhone, Body: body });
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(env.twilioAccountSid)}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(env.verificationRequestTimeoutMs)
    });
    await assertOk(response, "Twilio");
  }
  async sendVerification(input: { channel: "EMAIL" | "PHONE"; destination: string; code: string }) {
    if (input.channel !== "PHONE") throw Object.assign(new Error("This verification provider only supports SMS delivery."), { statusCode: 503, code: "VERIFICATION_CHANNEL_UNAVAILABLE" });
    await this.sms(input.destination, `Urgent Medicine verification code: ${input.code}. Do not share this code.`);
  }
  async sendPasswordReset() {
    throw Object.assign(new Error("Password reset is configured for email delivery; use the Resend-capable provider."), { statusCode: 503, code: "VERIFICATION_CHANNEL_UNAVAILABLE" });
  }
}

class ResendTwilioDelivery implements VerificationDelivery {
  private readonly email = new ResendDelivery();
  private readonly sms = new TwilioSmsDelivery();
  async sendVerification(input: { channel: "EMAIL" | "PHONE"; destination: string; code: string }) {
    return input.channel === "EMAIL" ? this.email.sendVerification(input) : this.sms.sendVerification(input);
  }
  async sendPasswordReset(input: { destination: string; token: string }) { return this.email.sendPasswordReset(input); }
}

class UnconfiguredProductionDelivery implements VerificationDelivery {
  async sendVerification() { throw Object.assign(new Error("Verification provider is not configured."), { statusCode: 503, code: "VERIFICATION_PROVIDER_UNAVAILABLE" }); }
  async sendPasswordReset() { throw Object.assign(new Error("Password reset provider is not configured."), { statusCode: 503, code: "VERIFICATION_PROVIDER_UNAVAILABLE" }); }
}

export const verificationDelivery: VerificationDelivery =
  env.verificationProvider === "console" ? new ConsoleVerificationDelivery() :
  env.verificationProvider === "resend" ? new ResendDelivery() :
  env.verificationProvider === "twilio" ? new TwilioSmsDelivery() :
  env.verificationProvider === "resend-twilio" ? new ResendTwilioDelivery() :
  new UnconfiguredProductionDelivery();
