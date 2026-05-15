import { createMagicToken } from "./auth";

export const SESSION_COOKIE = "pilpul_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 60;
const SESSION_PATTERN = /^(ps_|pil-)[A-Za-z0-9_-]{16,160}$/;

export function createSessionId(): string {
  return `ps_${createMagicToken()}`;
}

export function safeSessionId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return SESSION_PATTERN.test(trimmed) ? trimmed : null;
}

export function readCookie(cookieHeader: string | null | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}

export function sessionIdFromHeaders(headers: Headers): string | null {
  return (
    safeSessionId(readCookie(headers.get("cookie"), SESSION_COOKIE)) ||
    safeSessionId(headers.get("x-visitor-id"))
  );
}

export function sessionIdFromRequestLike(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const cookie = Array.isArray(headers.cookie) ? headers.cookie.join(";") : headers.cookie;
  const visitor = Array.isArray(headers["x-visitor-id"])
    ? headers["x-visitor-id"][0]
    : headers["x-visitor-id"];
  return safeSessionId(readCookie(cookie, SESSION_COOKIE)) || safeSessionId(visitor);
}

export function sessionCookie(sessionId: string, requestUrl: string): string {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`;
}

export function clearSessionCookie(requestUrl: string): string {
  const secure = new URL(requestUrl).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
