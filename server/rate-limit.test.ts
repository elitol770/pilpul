import { describe, expect, it } from "vitest";
import { clientIpFromHeaders, clientIpFromRequestLike, rateLimitKey } from "./rate-limit";

describe("clientIpFromHeaders", () => {
  it("prefers cf-connecting-ip, then x-real-ip, then x-forwarded-for", () => {
    const headers = new Headers();
    headers.set("x-forwarded-for", "1.1.1.1, 2.2.2.2");
    headers.set("x-real-ip", "3.3.3.3");
    headers.set("cf-connecting-ip", "4.4.4.4");
    expect(clientIpFromHeaders(headers)).toBe("4.4.4.4");

    headers.delete("cf-connecting-ip");
    expect(clientIpFromHeaders(headers)).toBe("3.3.3.3");

    headers.delete("x-real-ip");
    expect(clientIpFromHeaders(headers)).toBe("1.1.1.1");
  });

  it("falls back to 'unknown' when no header is set", () => {
    expect(clientIpFromHeaders(new Headers())).toBe("unknown");
  });
});

describe("clientIpFromRequestLike", () => {
  it("reads object-form headers and takes the first hop of x-forwarded-for", () => {
    const headers = { "x-forwarded-for": "5.5.5.5, 6.6.6.6" } as Record<string, string>;
    expect(clientIpFromRequestLike(headers)).toBe("5.5.5.5");
  });

  it("uses fallback IP when nothing matches", () => {
    expect(clientIpFromRequestLike({}, "9.9.9.9")).toBe("9.9.9.9");
    expect(clientIpFromRequestLike({})).toBe("unknown");
  });
});

describe("rateLimitKey", () => {
  it("is deterministic for the same parts and case-insensitive", async () => {
    const a = await rateLimitKey("login", "user@example.com");
    const b = await rateLimitKey("LOGIN", "User@Example.com");
    expect(a).toBe(b);
  });

  it("changes when parts differ", async () => {
    const a = await rateLimitKey("login", "user@a.test");
    const b = await rateLimitKey("login", "user@b.test");
    expect(a).not.toBe(b);
  });

  it("treats nullish parts as 'unknown' rather than empty", async () => {
    const a = await rateLimitKey("login", null);
    const b = await rateLimitKey("login", "unknown");
    expect(a).toBe(b);
  });
});
