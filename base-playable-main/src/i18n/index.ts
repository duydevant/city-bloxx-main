import type { Locales } from "../platform/i18n.js";
import { en } from "./en.js";
import { vi } from "./vi.js";

/**
 * Them ngon ngu moi: tao `src/i18n/xx.ts` roi them vao day.
 * Khoa fallback la "en".
 */
export const LOCALES: Locales = { en, vi };
export const FALLBACK_LOCALE = "en";
