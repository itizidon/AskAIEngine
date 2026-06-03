// lib/api.ts
const DEFAULT_API = "http://localhost:8000";

export function getApiBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API).replace(/\/$/, "");
}

export type TokenResponse = {
  access_token: string;
  token_type: string;
};

function parseFastApiError(data: unknown): string {
  if (!data || typeof data !== "object") return "Request failed";
  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === "object" && d && "msg" in d ? String((d as { msg: string }).msg) : String(d)))
      .join(", ");
  }
  return "Request failed";
}

export async function apiLogin(email: string, password: string): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.set("username", email);
  body.set("password", password);

  const res = await fetch(`${getApiBaseUrl()}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseFastApiError(data));
  return data as TokenResponse;
}

export async function apiSignup(name: string, email: string, password: string): Promise<TokenResponse> {
  const res = await fetch(`${getApiBaseUrl()}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(parseFastApiError(data));
  return data as TokenResponse;
}