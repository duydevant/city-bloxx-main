import { sdk, inPlayablesEnv, type SdkError } from "./ytgame.js";

/**
 * health.logError / logWarning — YouTube dung de theo doi chat luong game.
 * Ngoai Playables chi in ra console de ban debug.
 */

const MAX_CONTEXT = 1000;

function clip(context: string): string {
  return context.length > MAX_CONTEXT ? context.slice(0, MAX_CONTEXT) : context;
}

export function logWarning(context: string): void {
  const c = clip(context);
  console.warn("[playable]", c);
  if (!inPlayablesEnv()) return;
  try {
    void sdk()?.health.logWarning(c).catch(() => {});
  } catch {
    /* health API luon khong duoc lam game crash */
  }
}

export function logError(context: string, error?: unknown): void {
  const c = clip(error instanceof Error && error.message ? `${context}: ${error.message}` : context);
  console.error("[playable]", c, error ?? "");
  if (!inPlayablesEnv()) return;
  try {
    const err = error instanceof Error ? error : undefined;
    void sdk()?.health.logError(c, err).catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Mo ta ngan gon cua mot loi bat ky (ke ca SdkError co errorType). */
export function describeError(e: unknown): string {
  const err = e as SdkError | undefined;
  if (!err) return "UNKNOWN";
  const parts: string[] = [];
  if (err.errorType) parts.push(err.errorType);
  if (err.message) parts.push(err.message);
  return parts.length ? parts.join(" | ") : "UNKNOWN";
}

let installed = false;

/**
 * Tu dong day moi loi JS len health.logError.
 * Goi mot lan luc khoi dong.
 */
export function installErrorReporting(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (ev) => {
    logError("window.onerror", ev.error ?? new Error(ev.message || "uncaught error"));
  });

  window.addEventListener("unhandledrejection", (ev) => {
    logError("unhandledrejection", ev.reason);
  });
}
