/**
 * Toast nho o cuoi man hinh, dung cho thong bao ngan
 * ("Ad not available", "Score saved"...).
 */

export interface ToastApi {
  (msg: string, ms?: number): void;
}

export function createToast(host: HTMLElement): ToastApi {
  const el = document.createElement("div");
  el.className = "pv-toast hidden";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  host.appendChild(el);

  let timer: number | undefined;

  const toast: ToastApi = (msg: string, ms = 2200): void => {
    el.textContent = msg;
    el.classList.remove("hidden");
    window.clearTimeout(timer);
    timer = window.setTimeout(() => el.classList.add("hidden"), ms);
  };
  return toast;
}
