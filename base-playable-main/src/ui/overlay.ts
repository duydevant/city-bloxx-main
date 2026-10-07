import type { OverlayApi, OverlayButton } from "../platform/types.js";

/**
 * Modal generic dung cho game over / pause menu / win screen.
 * Dung innerHTML + textContent (khong noi chuoi do nguoi dung nhap)
 * nen khong co nguy co XSS.
 */

let seq = 0;

export function createOverlay(host: HTMLElement): OverlayApi {
  const overlay = document.createElement("div");
  overlay.className = "pv-overlay hidden";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-live", "polite");
  host.appendChild(overlay);

  let lastFocus: HTMLElement | null = null;

  function show(opts: { title?: string; body?: string; buttons: OverlayButton[] }): void {
    seq += 1;
    overlay.innerHTML = "";
    overlay.classList.remove("hidden");

    const card = document.createElement("div");
    card.className = "pv-card";

    if (opts.title) {
      const h = document.createElement("h2");
      h.className = "pv-title";
      h.id = `pv-title-${seq}`;
      h.textContent = opts.title;
      card.appendChild(h);
      overlay.setAttribute("aria-labelledby", h.id);
    }
    if (opts.body) {
      const p = document.createElement("p");
      p.className = "pv-body";
      p.textContent = opts.body;
      card.appendChild(p);
    }

    const row = document.createElement("div");
    row.className = "pv-buttons";
    for (const b of opts.buttons) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `pv-btn pv-btn--${b.variant ?? "primary"}`;
      btn.textContent = b.label;
      btn.addEventListener("click", () => {
        if (b.disableOnClick) {
          btn.disabled = true;
          btn.classList.add("is-busy");
        }
        b.onClick();
        if (b.disableOnClick) {
          // Ad khong co san / nguoi dung bo qua -> mo lai nut de ho thu lan nua.
          window.setTimeout(() => {
            btn.disabled = false;
            btn.classList.remove("is-busy");
          }, 1200);
        }
      });
      row.appendChild(btn);
    }
    card.appendChild(row);
    overlay.appendChild(card);

    lastFocus = document.activeElement as HTMLElement | null;
    const first = row.querySelector<HTMLButtonElement>(".pv-btn");
    first?.focus();
  }

  function hide(): void {
    overlay.classList.add("hidden");
    overlay.innerHTML = "";
    overlay.removeAttribute("aria-labelledby");
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
    lastFocus = null;
  }

  function isVisible(): boolean {
    return !overlay.classList.contains("hidden");
  }

  return { show, hide, isVisible };
}
