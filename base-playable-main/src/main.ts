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
 * Thu tu o day chinh la thu tu YouTube yeu cau (Test Suite MUST):
 *   1. mock SDK (neu dang chay ngoai YouTube)
 *   2. bat error reporting
 *   3. lay ngon ngu tu SDK
 *   4. tao host + dung game
 *   5. cho frame dau tien ve xong
 *   6. AN man hinh loading
 *   7. firstFrameReady()
 *   8. gameReady()
 *
 * Game cua ban chi can viet `src/game/index.ts`. Dung dong vao file nay.
 */

async function boot(): Promise<void> {
  ensureMock();
  installErrorReporting();

  document.title = config.gameName;

  const host = createHost();

  await initI18n(LOCALES, { fallback: FALLBACK_LOCALE });
  applyTranslations();

  await game.create(host);

  // Doi 2 frame de chac chan man hinh game da duoc ve that.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      host.hideLoading();
      notifyFirstFrameReady();
      if (game.autoReady !== false) notifyGameReady();
    });
  });
}

boot().catch((e: unknown) => {
  logError("Game boot failed", e);
  document.getElementById("loading")?.setAttribute("hidden", "");
  const root = document.getElementById("app") ?? document.body;
  root.replaceChildren();
  const message = document.createElement("p");
  message.textContent = t("bootFailed");
  const retry = document.createElement("button");
  retry.textContent = t("retry");
  retry.addEventListener("click", () => window.location.reload());
  root.append(message, retry);
});
