const BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";

async function csrfToken(): Promise<string> {
  const res = await fetch(`${BASE}/auth/csrf`, { credentials: "include", cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.data?.csrfToken) throw new Error("Security initialization failed. Please refresh and try again.");
  return data.data.csrfToken;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  const headers: Record<string, string> = { ...(isFormData ? {} : { "Content-Type": "application/json" }), ...(init.headers as Record<string, string> | undefined) };
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) headers["X-CSRF-Token"] = await csrfToken();
  const res = await fetch(`${BASE}${path}`, { ...init, credentials: "include", headers, cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data?.error?.message ?? "Request failed") as Error & { code?: string; details?: unknown };
    error.code = data?.error?.code;
    error.details = data?.error?.details;
    throw error;
  }
  return data;
}
