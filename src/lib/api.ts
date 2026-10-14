export const API_URL = (import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "http://localhost:3001" : "")).replace(/\/$/, "");

export const AUTH_TOKEN_KEY = "neurowin-auth-token";
export const AUTH_USER_KEY = "neurowin-auth-user";

export type AuthUser = {
  id: string;
  neurowinId: string;
  name: string;
  email: string;
  role: "user" | "admin" | string;
  status: string;
  createdAt?: string | null;
  lastLoginAt?: string | null;
};

export function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function storeSession(token: string, user: AuthUser) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers || {});

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const text = await response.text();
  let data: unknown = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text || `HTTP ${response.status}` };
  }

  if (!response.ok) {
    const message =
      typeof data === "object" && data && "error" in data
        ? String((data as { error?: unknown }).error || `HTTP ${response.status}`)
        : `HTTP ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}
