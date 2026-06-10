import { describe, expect, it } from "vitest";
import { PAIRING_UNDO_WINDOW_MINUTES, canUndoPairing } from "./schema";

const now = new Date("2026-06-10T12:00:00Z");
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000).toISOString();

describe("canUndoPairing", () => {
  it("allows an active pairing inside the window", () => {
    expect(canUndoPairing({ status: "active", startedAt: minutesAgo(1) }, now)).toBe(true);
    expect(
      canUndoPairing({ status: "active", startedAt: minutesAgo(PAIRING_UNDO_WINDOW_MINUTES) }, now),
    ).toBe(true);
  });

  it("rejects once the window has passed", () => {
    expect(
      canUndoPairing(
        { status: "active", startedAt: minutesAgo(PAIRING_UNDO_WINDOW_MINUTES + 1) },
        now,
      ),
    ).toBe(false);
  });

  it("rejects non-active pairings regardless of age", () => {
    expect(canUndoPairing({ status: "dissolved", startedAt: minutesAgo(1) }, now)).toBe(false);
    expect(canUndoPairing({ status: "completed", startedAt: minutesAgo(1) }, now)).toBe(false);
  });

  it("rejects malformed or future start times", () => {
    expect(canUndoPairing({ status: "active", startedAt: "not a date" }, now)).toBe(false);
    expect(canUndoPairing({ status: "active", startedAt: minutesAgo(-2) }, now)).toBe(false);
  });
});
