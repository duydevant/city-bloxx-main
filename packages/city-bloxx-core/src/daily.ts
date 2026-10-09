import { DAILY_RECIPE } from "../../city-bloxx-content/daily";
import { PHYSICS_VERSION } from "./rules";

export interface DailyDefinition {
  id: string; dateUTC: string; scheduleVersion: "daily-v1"; seed: number;
  classId: "industrial"; targetBodyFloors: 20; roofEnabled: true; objective: "population";
  physicsVersion: string; rulesetVersion: string;
}
export const UTC_DAY_MS = 86400000;
export function isUTCDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
// The adapter supplies the timestamp; neither the recipe nor simulation reads a clock.
export function utcDate(timestamp: number): string {
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > 253402300799999) throw new Error("Invalid UTC clock");
  return new Date(timestamp).toISOString().slice(0, 10);
}
export function shiftUTCDate(date: string, days: number): string {
  if (!isUTCDate(date) || !Number.isInteger(days)) throw new Error("Invalid UTC date");
  const next = new Date(Date.parse(`${date}T00:00:00.000Z`) + days * UTC_DAY_MS).toISOString().slice(0, 10);
  if (!isUTCDate(next)) throw new Error("UTC date out of bounds");
  return next;
}
export function resolveDaily(dateUTC: string): DailyDefinition {
  if (!isUTCDate(dateUTC)) throw new Error("Invalid Daily date");
  const id = `${DAILY_RECIPE.scheduleVersion}|${dateUTC}`;
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619) >>> 0;
  return { id, dateUTC, ...DAILY_RECIPE, seed: hash | 0, physicsVersion: PHYSICS_VERSION };
}
export function validateDaily(value: unknown): DailyDefinition {
  if (!value || typeof value !== "object") throw new Error("Unsupported Daily definition; original preserved");
  const d = value as DailyDefinition, expected = resolveDaily(d.dateUTC);
  if (Object.keys(expected).some(key => d[key as keyof DailyDefinition] !== expected[key as keyof DailyDefinition])) throw new Error("Unsupported Daily definition; original preserved");
  return Object.freeze(expected);
}
export function dailyCountdown(timestamp: number): number {
  utcDate(timestamp);
  return Math.ceil((UTC_DAY_MS - timestamp % UTC_DAY_MS) / 1000);
}
