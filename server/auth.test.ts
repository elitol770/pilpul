import { describe, expect, it } from "vitest";
import { createMagicToken, hashMagicToken, magicLinkExpiresAt } from "./auth";

describe("createMagicToken", () => {
  it("produces a URL-safe base64 token of stable length", () => {
    const token = createMagicToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    // 32 random bytes -> 43-char base64url (no padding)
    expect(token.length).toBe(43);
  });

  it("returns a fresh token on each call", () => {
    const a = createMagicToken();
    const b = createMagicToken();
    expect(a).not.toBe(b);
  });
});

describe("hashMagicToken", () => {
  it("is deterministic for the same input", async () => {
    const a = await hashMagicToken("hello");
    const b = await hashMagicToken("hello");
    expect(a).toBe(b);
  });

  it("returns a 64-char hex SHA-256 digest", async () => {
    const hash = await hashMagicToken("hello");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("differs for distinct inputs", async () => {
    const a = await hashMagicToken("hello");
    const b = await hashMagicToken("hello!");
    expect(a).not.toBe(b);
  });
});

describe("magicLinkExpiresAt", () => {
  it("returns an ISO timestamp roughly N minutes in the future", () => {
    const beforeMs = Date.now();
    const expires = magicLinkExpiresAt(20);
    const expiresMs = Date.parse(expires);
    const delta = expiresMs - beforeMs;
    expect(delta).toBeGreaterThanOrEqual(20 * 60 * 1000 - 1000);
    expect(delta).toBeLessThanOrEqual(20 * 60 * 1000 + 1000);
  });
});
