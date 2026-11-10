import { afterEach, describe, expect, it, vi } from "vitest";
import { appOrigin, buildMagicLink, canReturnDevMagicLink, sendMagicLinkEmail } from "./email";

afterEach(() => vi.unstubAllGlobals());

describe("documented local sign-in configuration", () => {
  it("allows a local link without enabling the remote development override", () => {
    const origin = appOrigin("http://localhost:5000/api/auth/magic-link", "http://localhost:5000");
    expect(canReturnDevMagicLink(origin, { ALLOW_DEV_MAGIC_LINKS: "false" })).toBe(true);
    expect(buildMagicLink(origin, "example+token")).toBe(
      "http://localhost:5000/#/auth/callback?token=example%2Btoken",
    );
  });

  it("does not treat a configured remote origin as local", () => {
    const origin = appOrigin(
      "http://localhost:5000/api/auth/magic-link",
      "https://example.invalid",
    );
    expect(canReturnDevMagicLink(origin, { ALLOW_DEV_MAGIC_LINKS: "false" })).toBe(false);
  });

  it("skips delivery only when the email API key is empty", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      sendMagicLinkEmail({
        env: { RESEND_API_KEY: "" },
        to: "reader@example.invalid",
        magicLink: "http://localhost:5000/#/auth/callback?token=example",
      }),
    ).resolves.toEqual({ sent: false, reason: "missing-key" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends through Resend without enabling development links", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetch);
    await expect(
      sendMagicLinkEmail({
        env: { RESEND_API_KEY: "test-placeholder", ALLOW_DEV_MAGIC_LINKS: "false" },
        to: "reader@example.invalid",
        magicLink: "http://localhost:5000/#/auth/callback?token=example",
      }),
    ).resolves.toEqual({ sent: true });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("does not silently fall back when a configured mail provider rejects delivery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        statusText: "Forbidden",
        json: async () => ({ message: "Testing recipient not allowed" }),
      }),
    );
    await expect(
      sendMagicLinkEmail({
        env: { RESEND_API_KEY: "test-placeholder" },
        to: "reader@example.invalid",
        magicLink: "http://localhost:5000/#/auth/callback?token=example",
      }),
    ).rejects.toThrow("Testing recipient not allowed");
  });
});
