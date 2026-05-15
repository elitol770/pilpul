import { describe, expect, it } from "vitest";
import {
  encodeAvailability,
  hasScheduleOverlap,
  parseAvailability,
  type Availability,
} from "./availability";

const av = (windows: Availability["windows"], timezone = "UTC"): string =>
  encodeAvailability({ timezone, windows });

describe("parseAvailability", () => {
  it("rejects empty/invalid input", () => {
    expect(parseAvailability(null)).toBeNull();
    expect(parseAvailability("")).toBeNull();
    expect(parseAvailability("not json")).toBeNull();
    expect(parseAvailability(JSON.stringify({ timezone: "UTC", windows: [] }))).toBeNull();
  });

  it("rejects unknown timezones", () => {
    expect(
      parseAvailability(
        JSON.stringify({
          timezone: "Mars/Olympus_Mons",
          windows: [{ day: 1, start: "08:00", end: "10:00" }],
        }),
      ),
    ).toBeNull();
  });

  it("rejects windows shorter than 90 minutes", () => {
    expect(
      parseAvailability(
        JSON.stringify({
          timezone: "UTC",
          windows: [{ day: 1, start: "08:00", end: "09:00" }],
        }),
      ),
    ).toBeNull();
  });

  it("accepts a 90-minute window in a real timezone", () => {
    const parsed = parseAvailability(
      av([{ day: 1, start: "08:00", end: "09:30" }], "America/New_York"),
    );
    expect(parsed).not.toBeNull();
    expect(parsed?.windows).toHaveLength(1);
  });
});

describe("hasScheduleOverlap", () => {
  it("returns true for identical UTC windows", () => {
    const a = av([{ day: 1, start: "08:00", end: "10:00" }]);
    const b = av([{ day: 1, start: "08:00", end: "10:00" }]);
    expect(hasScheduleOverlap(a, b)).toBe(true);
  });

  it("returns true for partial overlap of at least 90 minutes", () => {
    const a = av([{ day: 1, start: "08:00", end: "10:00" }]);
    const b = av([{ day: 1, start: "08:30", end: "11:30" }]);
    expect(hasScheduleOverlap(a, b)).toBe(true);
  });

  it("returns false when overlap is below the minimum", () => {
    const a = av([{ day: 1, start: "08:00", end: "09:30" }]);
    const b = av([{ day: 1, start: "09:00", end: "10:30" }]);
    expect(hasScheduleOverlap(a, b)).toBe(false);
  });

  it("returns false on disjoint days", () => {
    const a = av([{ day: 1, start: "08:00", end: "10:00" }]);
    const b = av([{ day: 3, start: "08:00", end: "10:00" }]);
    expect(hasScheduleOverlap(a, b)).toBe(false);
  });

  it("accounts for timezone difference between users", () => {
    // 9-11 New York is 14-16 UTC; 14-16 London is 14-16 UTC.
    const a = av(
      [{ day: 1, start: "09:00", end: "11:00" }],
      "America/New_York",
    );
    const b = av([{ day: 1, start: "14:00", end: "16:00" }], "Europe/London");
    expect(hasScheduleOverlap(a, b)).toBe(true);
  });

  it("returns false when either side fails to parse", () => {
    const a = av([{ day: 1, start: "08:00", end: "10:00" }]);
    expect(hasScheduleOverlap(a, "garbage")).toBe(false);
    expect(hasScheduleOverlap(null, a)).toBe(false);
  });
});
