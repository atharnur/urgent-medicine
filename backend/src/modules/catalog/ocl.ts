import { env } from "../../config/env";

export interface OclPage {
  concepts: Record<string, any>[];
  nextUrl: string | null;
  total: number | null;
}

function parsePayload(payload: any): Record<string, any>[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.concepts)) return payload.concepts;
  if (Array.isArray(payload?.results?.items)) return payload.results.items;
  return [];
}

export async function fetchOclPage(url: string): Promise<OclPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.catalogRequestTimeoutMs);
  try {
    const headers: Record<string,string> = { accept: "application/json" };
    if (env.oclApiToken) headers.authorization = `Token ${env.oclApiToken}`;
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) throw new Error(`OCL request failed with HTTP ${response.status}`);
    const payload = await response.json();
    const concepts = parsePayload(payload);
    return {
      concepts,
      nextUrl: response.headers.get("next") || payload?.next || null,
      total: Number(response.headers.get("num_found") ?? payload?.num_found ?? payload?.count ?? NaN) || null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function initialOclUrl(): string {
  const base = env.oclBaseUrl.replace(/\/$/, "");
  const path = env.oclCollectionPath.replace(/^\//, "");
  const url = new URL(`${base}/${path}`);
  url.searchParams.set("limit", String(env.oclPageSize));
  url.searchParams.set("page", "1");
  url.searchParams.set("verbose", "true");
  return url.toString();
}
