import { hashMagicToken } from "./auth";

export type RateLimitPolicy = {
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  remaining: number;
  resetAt: string;
};

export async function rateLimitKey(...parts: Array<string | null | undefined>): Promise<string> {
  return await hashMagicToken(
    parts
      .map((part) => (part || "unknown").trim().toLowerCase())
      .join(":")
  );
}

export function clientIpFromHeaders(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ||
    headers.get("x-real-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export function clientIpFromRequestLike(
  headers: Record<string, string | string[] | undefined>,
  fallbackIp?: string
): string {
  const value = (name: string) => {
    const raw = headers[name.toLowerCase()] ?? headers[name];
    return Array.isArray(raw) ? raw[0] : raw;
  };

  return (
    value("cf-connecting-ip") ||
    value("x-real-ip") ||
    value("x-forwarded-for")?.split(",")[0]?.trim() ||
    fallbackIp ||
    "unknown"
  );
}

