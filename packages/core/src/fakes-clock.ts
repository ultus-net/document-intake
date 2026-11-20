import type { Clock } from "./types.js";

export function fixedClock(iso: string): Clock {
  return { now: () => new Date(iso) };
}
