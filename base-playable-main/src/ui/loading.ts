import type { LoadingApi } from "../platform/types.js";

/**
 * Man hinh loading.
 *
 * LUAT CUNG: `gameReady()` khong duoc goi khi man nay con hien.
 * main.ts se tu dong an no truoc khi bao ready, va co them mot safety timer
 * de MUST-check khong bao gio bi bo sot.
 */

export function createLoading(): LoadingApi {
  const el = document.getElementById("loading");
  const bar = el?.querySelector<HTMLElement>(".bar > i") ?? null;

  function show(): void {
    if (!el) return;
    el.hidden = false;
  }
  function hide(): void {
    if (!el) return;
    el.hidden = true;
  }
  function progress(value: number): void {
    if (!bar) return;
    const p = Math.max(0, Math.min(1, value));
    bar.style.animation = "none";
    bar.style.width = `${Math.round(p * 100)}%`;
    bar.style.transform = "none";
  }
  function isVisible(): boolean {
    return !!el && el.hidden === false;
  }

  return { show, hide, progress, isVisible };
}
