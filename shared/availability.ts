import { z } from "zod";

export const DAYS = [
  { value: 0, short: "Sun", label: "Sunday" },
  { value: 1, short: "Mon", label: "Monday" },
  { value: 2, short: "Tue", label: "Tuesday" },
  { value: 3, short: "Wed", label: "Wednesday" },
  { value: 4, short: "Thu", label: "Thursday" },
  { value: 5, short: "Fri", label: "Friday" },
  { value: 6, short: "Sat", label: "Saturday" },
] as const;

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

function rawTimeToMinutes(value: string): number {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export const availabilityWindowSchema = z.object({
  day: z.number().int().min(0).max(6),
  start: timeSchema,
  end: timeSchema,
}).refine((window) => {
  const start = rawTimeToMinutes(window.start);
  const end = rawTimeToMinutes(window.end);
  const duration = end > start ? end - start : end + 24 * 60 - start;
  return duration >= 90;
});

export const availabilitySchema = z.object({
  timezone: z.string().min(1).max(80),
  windows: z.array(availabilityWindowSchema).min(1).max(14),
});

export type Availability = z.infer<typeof availabilitySchema>;
export type AvailabilityWindow = z.infer<typeof availabilityWindowSchema>;

const WEEK_MINUTES = 7 * 24 * 60;
const WEEK_START_UTC_MS = Date.UTC(2026, 0, 4, 0, 0, 0);

function validTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function encodeAvailability(availability: Availability): string {
  return JSON.stringify(availability);
}

export function parseAvailability(value: string | null | undefined): Availability | null {
  if (!value) return null;
  try {
    const parsed = availabilitySchema.safeParse(JSON.parse(value));
    if (!parsed.success || !validTimezone(parsed.data.timezone)) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function parseTime(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(":").map(Number);
  return { hour, minute };
}

function timeToMinutes(value: string): number {
  return rawTimeToMinutes(value);
}

function formatTime(value: string): string {
  const { hour, minute } = parseTime(value);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute.toString().padStart(2, "0")} ${suffix}`;
}

export function formatAvailabilitySummary(value: string | null | undefined): string {
  const availability = parseAvailability(value);
  if (!availability) return value ?? "";

  const windows = availability.windows
    .slice()
    .sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))
    .map((window) => {
      const day = DAYS.find((item) => item.value === window.day)?.short ?? "Day";
      return `${day} ${formatTime(window.start)}-${formatTime(window.end)}`;
    });

  return `${windows.join(", ")} ${availability.timezone}`;
}

function offsetMinutesAt(date: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localAsUtcMs = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second)
  );
  return (localAsUtcMs - date.getTime()) / 60000;
}

function localToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timezone: string
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstOffset = offsetMinutesAt(new Date(guess), timezone);
  let result = guess - firstOffset * 60000;
  const secondOffset = offsetMinutesAt(new Date(result), timezone);
  if (secondOffset !== firstOffset) {
    result = guess - secondOffset * 60000;
  }
  return result;
}

function splitIntoWeek(startMinute: number, endMinute: number): Array<[number, number]> {
  let start = startMinute;
  let end = endMinute;
  while (end <= 0) {
    start += WEEK_MINUTES;
    end += WEEK_MINUTES;
  }
  while (start >= WEEK_MINUTES) {
    start -= WEEK_MINUTES;
    end -= WEEK_MINUTES;
  }

  const intervals: Array<[number, number]> = [];
  if (start < 0) {
    intervals.push([start + WEEK_MINUTES, WEEK_MINUTES]);
    intervals.push([0, end]);
  } else if (end > WEEK_MINUTES) {
    intervals.push([start, WEEK_MINUTES]);
    intervals.push([0, end - WEEK_MINUTES]);
  } else {
    intervals.push([start, end]);
  }
  return intervals.filter(([a, b]) => b > a);
}

function intervalsForAvailability(availability: Availability): Array<[number, number]> {
  return availability.windows.flatMap((window) => {
    const start = parseTime(window.start);
    const end = parseTime(window.end);
    const startDay = 4 + window.day;
    const endDay = timeToMinutes(window.end) <= timeToMinutes(window.start) ? startDay + 1 : startDay;
    const startMs = localToUtcMs(2026, 1, startDay, start.hour, start.minute, availability.timezone);
    const endMs = localToUtcMs(2026, 1, endDay, end.hour, end.minute, availability.timezone);
    const startMinute = Math.floor((startMs - WEEK_START_UTC_MS) / 60000);
    const endMinute = Math.floor((endMs - WEEK_START_UTC_MS) / 60000);
    return splitIntoWeek(startMinute, endMinute);
  });
}

export function hasScheduleOverlap(
  aValue: string | null | undefined,
  bValue: string | null | undefined,
  minimumMinutes = 90
): boolean {
  const a = parseAvailability(aValue);
  const b = parseAvailability(bValue);
  if (!a || !b) return false;

  const aIntervals = intervalsForAvailability(a);
  const bIntervals = intervalsForAvailability(b);
  return aIntervals.some(([aStart, aEnd]) =>
    bIntervals.some(([bStart, bEnd]) => Math.min(aEnd, bEnd) - Math.max(aStart, bStart) >= minimumMinutes)
  );
}
