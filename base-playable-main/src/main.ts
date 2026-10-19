import "./styles/tokens.css";
import "./styles/base.css";

import { ensureMock } from "./platform/ytgame.js";
import { installErrorReporting, logError } from "./platform/health.js";
import { initI18n, applyTranslations, t } from "./platform/i18n.js";
import { createHost } from "./platform/host.js";
import { notifyFirstFrameReady, notifyGameReady } from "./platform/lifecycle.js";
import { config } from "./platform/config.js";
import { LOCALES, FALLBACK_LOCALE } from "./i18n/index.js";
import { game } from "./game/index.js";

/**
 * Diem khoi dong duy nhat cua base.
 *
 * Thu tu o day chinh la thu tu YouTube yeu cau (Test Suite MUST + Y0):
 *   1. mock SDK (neu dang chay ngoai YouTube)
 *   2. bat error reporting
 *   3. tao host + lay ngon ngu tu SDK + hien loading
 *   4. firstFrameReady() ngay khi frame loading dau tien da ve xong
 *   5. dung game (await game.create(host))
 *   6. an man hinh loading
 *   7. cho frame tuong tac cua game ve xong -> gameReady()
 */

let bootFailed = false;

async function boot(): Promise<void> {
  ensureMock();
  installErrorReporting();

  document.title = config.gameName;

  const host = createHost();

  await initI18n(LOCALES, { fallback: FALLBACK_LOCALE });
  applyTranslations();

  // Goi firstFrameReady ngay khi frame loading dau tien duoc ve.
  requestAnimationFrame(() => {
    if (!bootFailed) notifyFirstFrameReady();
  });

  const testFault = (window as unknown as { __forceBootError?: string }).__forceBootError;
  if (testFault) {
    throw new Error(testFault);
  }

  await game.create(host);

  // Sau khi game.create(host) hoan tat: dam bao firstFrameReady da goi khi loading con hien,
  // an loading, roi doi frame tuong tac duoc ve xong moi goi gameReady().
  requestAnimationFrame(() => {
    if (bootFailed) return;
    notifyFirstFrameReady();
    host.hideLoading();
    requestAnimationFrame(() => {
      if (!bootFailed && game.autoReady !== false) notifyGameReady();
    });
  });
}

boot().catch((e: unknown) => {
  bootFailed = true;
  logError("Game boot failed", e);
  notifyFirstFrameReady();
  document.getElementById("loading")?.setAttribute("hidden", "");
  const root = document.getElementById("app") ?? document.body;
  root.replaceChildren();
  const wrapper = document.createElement("div");
  wrapper.dataset.bootError = "true";
  wrapper.setAttribute("role", "alert");
  const message = document.createElement("p");
  message.dataset.bootErrorMessage = "true";
  message.textContent = t("bootFailed");
  const retry = document.createElement("button");
  retry.type = "button";
  retry.dataset.bootRetry = "true";
  retry.textContent = t("retry");
  retry.addEventListener("click", () => window.location.reload());
  wrapper.append(message, retry);
  root.append(wrapper);
});
