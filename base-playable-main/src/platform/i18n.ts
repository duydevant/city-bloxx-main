import { sdk, inPlayablesEnv } from "./ytgame.js";
import { logError, logWarning } from "./health.js";

/**
 * Da ngon ngu.
 *
 * YouTube YEU CAU lay ngon ngu qua `ytgame.system.getLanguage()` (BCP-47).
 * Khong duoc tu suy ra tu IP, ten mien hay bat ky cach nao khac.
 * Ngoai Playables thi dung navigator.language de ban test cho tien.
 */

export type LocaleDict = Record<string, string>;
export type Locales = Record<string, LocaleDict>;

let locales: Locales = {};
let fallback = "en";
let locale = "en";

/** Chon locale tot nhat tu danh sach co san. */
export function resolveLocale(tag: string, available: string[]): string {
  const norm = (s: string): string => s.toLowerCase().replace(/_/g, "-");
  const want = norm(tag || "");
  if (!want) return fallback;
  const list = available.map((a) => ({ raw: a, n: norm(a) }));

  const exact = list.find((a) => a.n === want);
  if (exact) return exact.raw;

  const wantBase = want.split("-")[0];
  const base = list.find((a) => a.n.split("-")[0] === wantBase);
  if (base) return base.raw;

  const en = list.find((a) => a.n.split("-")[0] === "en");
  return en ? en.raw : fallback;
}

export async function initI18n(
  dicts: Locales,
  opts: { fallback?: string; force?: string } = {}
): Promise<string> {
  locales = dicts;
  const keys = Object.keys(dicts);
  fallback = opts.fallback && keys.includes(opts.fallback) ? opts.fallback : keys[0] ?? "en";

  let tag = "en-US";
  if (opts.force) {
    tag = opts.force;
  } else if (inPlayablesEnv()) {
    try {
      tag = await sdk()!.system.getLanguage();
    } catch (e) {
      logError("getLanguage failed, falling back to en", e);
      tag = "en-US";
    }
  } else {
    tag = (typeof navigator !== "undefined" && navigator.language) || "en-US";
  }

  locale = resolveLocale(tag, keys);
  if (typeof document !== "undefined") {
    document.documentElement.lang = locale;
  }
  if (!keys.length) logWarning("initI18n called with an empty dictionary");
  return locale;
}

export function currentLocale(): string {
  return locale;
}

export function setLocale(code: string): string {
  const keys = Object.keys(locales);
  locale = resolveLocale(code, keys);
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  return locale;
}

/**
 * Dich chuoi, ho tro bien: t("hello", { name: "An" }) voi "Hello {name}".
 * Thieu key -> fallback -> tra ve chinh key (de ban phat hien nhanh).
 */
export function t(key: string, vars?: Record<string, string | number>): string {
  let s = locales[locale]?.[key];
  if (s === undefined) s = locales[fallback]?.[key];
  if (s === undefined) {
    logWarning(`i18n key missing: ${key}`);
    return key;
  }
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m
  );
}

/**
 * Dich moi phan tu co `data-i18n="key"` (hoac `data-i18n-attr="placeholder:key"`).
 * Goi lai sau khi setLocale() de cap nhat UI.
 */
export function applyTranslations(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    const k = el.dataset.i18n;
    if (k) el.textContent = t(k);
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-attr]").forEach((el) => {
    for (const pair of el.dataset.i18nAttr!.split(",")) {
      const [attr, k] = pair.split(":").map((s) => s.trim());
      if (attr && k) el.setAttribute(attr, t(k));
    }
  });
}
