const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const assert = require("node:assert/strict");
const esbuild = require("node:module").createRequire(
  path.resolve(__dirname, "../base-playable-main/package.json"),
)("esbuild");
const fixture = require("../packages/city-bloxx-core/fixtures/quick-mixed-v13.json");

const root = path.resolve(__dirname, "..");
const evidencePath = path.join(root, "plan", "evidence", "C7-validation.json");
const reportDir = path.join(root, "tmp", "c7-qa");
fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(path.dirname(evidencePath), { recursive: true });

const bundle = esbuild.buildSync({
  entryPoints: [path.join(root, "packages/city-bloxx-core/src/index.ts")],
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "CityBloxx",
  write: false,
}).outputFiles[0].text;

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function startStaticServer(rootDir, port) {
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
  };
  const server = http.createServer((req, res) => {
    const cleanUrl = (req.url || "/").split("?")[0];
    const rel = cleanUrl === "/" ? "/index.html" : cleanUrl;
    const filePath = path.join(rootDir, decodeURIComponent(rel));
    if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function waitForHttp(url, maxTries = 120) {
  for (let i = 0; i < maxTries; i++) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return;
    } catch {
      // retry
    }
    await delay(250);
  }
  throw new Error(`HTTP server did not become ready at ${url}`);
}

async function main() {
  const webPort = 3017;
  const playablePort = 4177;
  const debugPort = 9230;
  const webOrigin = `http://127.0.0.1:${webPort}`;
  const webPlayUrl = `${webOrigin}/play`;
  const playableUrl = `http://127.0.0.1:${playablePort}/`;

  const nextBin = path.join(root, "base-game-nextjs", "node_modules", "next", "dist", "bin", "next");
  const webProc = spawn(process.execPath, [nextBin, "start", "-p", String(webPort), "-H", "127.0.0.1"], {
    cwd: path.join(root, "base-game-nextjs"),
    windowsHide: true,
    stdio: "ignore",
  });
  const playableServer = await startStaticServer(path.join(root, "base-playable-main", "dist"), playablePort);

  const profile = fs.mkdtempSync(path.join(reportDir, "chrome-"));
  const chrome = spawn(
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-first-run",
      "--no-default-browser-check",
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { windowsHide: true, stdio: "ignore" },
  );

  let socket;
  let sequence = 0;
  const pending = new Map();
  const errors = [];
  const playableNetworkUrls = [];
  let trackingPlayableRequests = false;

  function send(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CDP timeout ${method}`));
      }, 30000);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  }

  async function waitFor(expression) {
    for (let i = 0; i < 100; i++) {
      if (await evaluate(expression)) return;
      await delay(100);
    }
    throw new Error(
      `Condition not reached: ${expression}; text=${await evaluate("document.body?.innerText.slice(0,800)")}; errors=${JSON.stringify(errors)}`,
    );
  }

  async function switchLanguage(kind, locale) {
    if (kind === "playable") {
      const current = await evaluate('document.querySelector(".cb-game")?.lang');
      if (current !== locale) {
        await evaluate('document.querySelector("[data-language]").click()');
      }
    } else {
      await evaluate('document.querySelector("header [role=combobox]").click()');
      await waitFor('document.querySelector("[role=option]") !== null');
      await evaluate(
        `[...document.querySelectorAll('[role=option]')].find(el => el.textContent.includes(${JSON.stringify(
          locale === "vi" ? "Tiếng Việt" : "English",
        )})).click()`,
      );
    }
    await waitFor(`document.querySelector(".cb-game")?.lang === ${JSON.stringify(locale)}`);
  }

  async function checkPanelLayouts(kind, label) {
    const results = {};
    for (const [width, height] of [
      [320, 568],
      [390, 844],
      [900, 430],
    ]) {
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: true });
      await delay(60);
      await evaluate("if (window.__step) window.__step()");
      const layout = await evaluate(`(() => {
        const panel = document.querySelector('.cb-panel');
        const bounds = panel.getBoundingClientRect();
        const clipped = [...panel.querySelectorAll('h2,h3,li,dt,dd,button,select')].filter(el => {
          if (el.hidden) return false;
          const r = el.getBoundingClientRect();
          return r.left < bounds.left - 1 || r.right > bounds.right + 1 || r.top < bounds.top - 1 || r.bottom > bounds.bottom + 1;
        }).map(el => el.textContent.trim());
        const doc = document.scrollingElement;
        return {
          overflowX: Math.max(0, doc.scrollWidth - innerWidth),
          overflowY: Math.max(0, doc.scrollHeight - innerHeight),
          clipped,
        };
      })()`);
      assert.equal(layout.overflowX, 0, `${kind} ${label} ${width}x${height} overflowX`);
      assert.equal(layout.overflowY, 0, `${kind} ${label} ${width}x${height} overflowY`);
      assert.deepEqual(layout.clipped, [], `${kind} ${label} ${width}x${height} clipped: ${JSON.stringify(layout.clipped)}`);
      results[`${width}x${height}`] = layout;
    }
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    return results;
  }

  async function verifyPlatform(kind, url) {
    const storageKey = kind === "web" ? "city-bloxx.quick-save.v2" : "city_bloxx_save_v1";
    const stamp = Date.parse("2026-10-15T12:00:00Z");

    const script = await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        window.__frameCount = 0; window.__frames = new Map(); window.__rafId = 0;
        window.requestAnimationFrame = cb => { const id = ++window.__rafId; window.__frames.set(id, cb); return id; };
        window.cancelAnimationFrame = id => window.__frames.delete(id);
        window.__step = () => {
          const entries = [...window.__frames.values()];
          window.__frames.clear();
          const time = 100 + (++window.__frameCount) * 1000 / 60;
          entries.forEach(cb => cb(time));
        };
        window.__clock = ${stamp};
        Date.now = () => window.__clock;
        ${bundle}
        let base = CityBloxx.initializeTracking(CityBloxx.emptySave(), 'c7-${kind}', ${stamp});
        base = CityBloxx.ensureMissions(base, ${stamp});
        base = CityBloxx.ensureWeeklyContracts(base, ${stamp});
        // Mark weekly-land-200 ready, winter-land-500 ready, and season SP = 2000 so claim buttons are active
        base.liveOps.weekly.weeks[0].slots[0] = {
          ...base.liveOps.weekly.weeks[0].slots[0],
          progress: 200,
          status: 'ready',
          completedAt: ${stamp},
        };
        base.liveOps.winterEvent = {
          ...base.liveOps.winterEvent,
          landed: 500,
          perfect: 100,
          dailyComplete: 7,
        };
        base.liveOps.freeSeason = {
          ...base.liveOps.freeSeason,
          sp: 2000,
        };
        const g = new CityBloxx.QuickTowerGame(${JSON.stringify(fixture.config)});
        let idx = 0;
        for (let t = 0; t < ${fixture.endTick}; t++) {
          if (${JSON.stringify(fixture.inputs)}[idx]?.tick === t) {
            g.drop(${JSON.stringify(fixture.inputs)}[idx].fraction);
            idx++;
          }
          g.advanceTicks(1);
        }
        const alloc = CityBloxx.allocateRun(base, ${stamp});
        const settled = CityBloxx.settleRun(alloc.save, CityBloxx.makeSummary(g, alloc.context, ${stamp + 5000}), ${JSON.stringify(fixture)});
        settled.tutorials = { quick: true, city: true, daily: true };
        localStorage.setItem(${JSON.stringify(storageKey)}, JSON.stringify(${kind === "web" ? "settled" : "{ v: 1, d: settled }"}));
      `,
    });
    if (kind === "playable") {
      playableNetworkUrls.length = 0;
      trackingPlayableRequests = true;
    }
    await send("Page.navigate", { url });
    await waitFor('document.querySelector(".cb-panel h2")?.textContent === "Quick Tower"');
    await evaluate("for (let i = 0; i < 4; i++) window.__step()");
    await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: script.identifier });

    const readSave = () =>
      evaluate(`(() => {
        const raw = JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)}));
        return ${kind === "web" ? "raw" : "raw.d"};
      })()`);

    const layouts = {};

    // 1. C7.2: Perfect Rush entry & guide screens (EN/VI)
    await evaluate('document.querySelector("[data-open-perfect-rush]").click()');
    await waitFor('document.querySelector(".cb-panel h2")?.textContent?.startsWith("Perfect Rush")');
    layouts.perfectRushEntryEn = await checkPanelLayouts(kind, "perfect-rush-entry-en");
    await switchLanguage(kind, "vi");
    layouts.perfectRushEntryVi = await checkPanelLayouts(kind, "perfect-rush-entry-vi");
    await switchLanguage(kind, "en");

    await evaluate('document.querySelector("[data-perfect-rush-guide]").click()');
    await waitFor('document.querySelector(".cb-panel h2")?.textContent?.includes("Rules")');
    layouts.perfectRushGuideEn = await checkPanelLayouts(kind, "perfect-rush-guide-en");
    await switchLanguage(kind, "vi");
    layouts.perfectRushGuideVi = await checkPanelLayouts(kind, "perfect-rush-guide-vi");
    await switchLanguage(kind, "en");
    await evaluate(`Array.from(document.querySelectorAll('.cb-game button')).find(b => b.textContent === 'Back').click()`);
    await evaluate(`Array.from(document.querySelectorAll('.cb-game button')).find(b => b.textContent === 'Home').click()`);
    await waitFor('document.querySelector(".cb-panel h2")?.textContent === "Quick Tower"');

    // 2. C7.3: Skyline Sprint entry & guide screens (EN/VI)
    await evaluate('document.querySelector("[data-open-skyline-sprint]").click()');
    await waitFor('document.querySelector(".cb-panel h2")?.textContent?.startsWith("Skyline Sprint")');
    layouts.skylineSprintEntryEn = await checkPanelLayouts(kind, "skyline-sprint-entry-en");
    await switchLanguage(kind, "vi");
    layouts.skylineSprintEntryVi = await checkPanelLayouts(kind, "skyline-sprint-entry-vi");
    await switchLanguage(kind, "en");

    await evaluate('document.querySelector("[data-skyline-sprint-guide]").click()');
    await waitFor('document.querySelector(".cb-panel h2")?.textContent?.includes("Rules")');
    layouts.skylineSprintGuideEn = await checkPanelLayouts(kind, "skyline-sprint-guide-en");
    await switchLanguage(kind, "vi");
    layouts.skylineSprintGuideVi = await checkPanelLayouts(kind, "skyline-sprint-guide-vi");
    await switchLanguage(kind, "en");
    await evaluate(`Array.from(document.querySelectorAll('.cb-game button')).find(b => b.textContent === 'Back').click()`);
    await evaluate(`Array.from(document.querySelectorAll('.cb-game button')).find(b => b.textContent === 'Home').click()`);
    await waitFor('document.querySelector(".cb-panel h2")?.textContent === "Quick Tower"');

    // 3. C7.1, C7.4, C7.5: Progression -> Missions & Season page (3/5) -> tabs (Weekly, Winter, Season) & Claim flows
    await evaluate(`Array.from(document.querySelectorAll('.cb-game button')).find(b => b.textContent.startsWith('Progression')).click()`);
    await waitFor('document.querySelector(".cb-progression-panel") !== null');
    await evaluate(`Array.from(document.querySelectorAll('.cb-game button')).find(b => b.textContent === 'Next').click()`);
    await evaluate(`Array.from(document.querySelectorAll('.cb-game button')).find(b => b.textContent === 'Next').click()`);
    await waitFor('document.querySelector("select[data-mission-tab]") !== null');

    // Switch to Weekly Contracts tab
    await evaluate(`(() => { const s = document.querySelector("select[data-mission-tab]"); s.value = "weekly"; s.dispatchEvent(new Event("change")); })()`);
    await waitFor('document.querySelectorAll("[data-weekly-id]").length === 3');
    layouts.weeklyContractsEn = await checkPanelLayouts(kind, "weekly-contracts-en");
    await switchLanguage(kind, "vi");
    layouts.weeklyContractsVi = await checkPanelLayouts(kind, "weekly-contracts-vi");
    await switchLanguage(kind, "en");
    await waitFor('document.querySelector("[data-weekly-claim=\\"weekly-land-200\\"]:not(:disabled)") !== null');
    await evaluate('document.querySelector("[data-weekly-claim=\\"weekly-land-200\\"]").click()');
    await delay(50);

    // Switch to Winter Event tab
    await evaluate(`(() => { const s = document.querySelector("select[data-mission-tab]"); s.value = "event"; s.dispatchEvent(new Event("change")); })()`);
    await waitFor('document.querySelectorAll("[data-event-goal-id]").length === 3');
    layouts.winterEventEn = await checkPanelLayouts(kind, "winter-event-en");
    await switchLanguage(kind, "vi");
    layouts.winterEventVi = await checkPanelLayouts(kind, "winter-event-vi");
    await switchLanguage(kind, "en");
    await waitFor('document.querySelector("[data-event-claim=\\"winter-land-500\\"]:not(:disabled)") !== null');
    await evaluate('document.querySelector("[data-event-claim=\\"winter-land-500\\"]").click()');
    await waitFor('document.querySelector("[data-event-claim=\\"winter-perfect-100\\"]:not(:disabled)") !== null');
    await evaluate('document.querySelector("[data-event-claim=\\"winter-perfect-100\\"]").click()');
    await waitFor('document.querySelector("[data-event-claim=\\"winter-daily-7\\"]:not(:disabled)") !== null');
    await evaluate('document.querySelector("[data-event-claim=\\"winter-daily-7\\"]").click()');
    await delay(50);

    // Switch to Free Season tab
    await evaluate(`(() => { const s = document.querySelector("select[data-mission-tab]"); s.value = "season"; s.dispatchEvent(new Event("change")); })()`);
    await waitFor('document.querySelectorAll("[data-season-tier]").length >= 1');
    layouts.freeSeasonEn = await checkPanelLayouts(kind, "free-season-en");
    await switchLanguage(kind, "vi");
    layouts.freeSeasonVi = await checkPanelLayouts(kind, "free-season-vi");
    await switchLanguage(kind, "en");
    await waitFor('document.querySelector("[data-season-claim=\\"1\\"]:not(:disabled)") !== null');
    await evaluate('document.querySelector("[data-season-claim=\\"1\\"]").click()');
    await delay(50);

    // Return Home and check Architecture Book Customize group pagination (Event & Season on Roof step 2/3)
    await evaluate(`Array.from(document.querySelectorAll('.cb-game button')).find(b => b.textContent === 'Back').click()`);
    await waitFor('document.querySelector(".cb-panel h2")?.textContent === "Quick Tower"');
    await evaluate(`Array.from(document.querySelectorAll('.cb-game button')).find(b => b.textContent.startsWith('Architecture Book')).click()`);
    await waitFor('document.querySelector(".cb-book-panel") !== null');
    await evaluate(`Array.from(document.querySelectorAll('.cb-game button')).find(b => b.textContent === 'Customize').click()`);
    await evaluate(`Array.from(document.querySelectorAll('.cb-game button')).find(b => b.textContent === 'Next').click()`);
    await waitFor('document.querySelector("select[data-cosmetic-group]") !== null');
    await evaluate(`(() => { const s = document.querySelector("select[data-cosmetic-group]"); s.value = "1"; s.dispatchEvent(new Event("change")); })()`);
    layouts.customizeEventSeasonEn = await checkPanelLayouts(kind, "customize-event-season-en");
    await switchLanguage(kind, "vi");
    layouts.customizeEventSeasonVi = await checkPanelLayouts(kind, "customize-event-season-vi");
    await switchLanguage(kind, "en");

    if (kind === "playable") {
      trackingPlayableRequests = false;
    }

    const finalSave = await readSave();
    const saveJson = JSON.stringify(finalSave);
    const saveBytes = Math.max(Buffer.byteLength(saveJson), saveJson.length * 2);
    assert(saveBytes <= 256 * 1024, `${kind} saveBytes (${saveBytes}) must be <= 256 KiB`);
    assert(finalSave.liveOps.weekly.claimedReceipts.includes("2026-10-12:weekly-land-200"));
    assert(finalSave.inventory.owned.includes("winter-roof-residential"));
    assert(finalSave.inventory.owned.includes("winter-crane"));
    assert(finalSave.inventory.owned.includes("winter-badge"));
    assert(finalSave.liveOps.freeSeason.claimedTiers.includes(1));

    return {
      schema: finalSave.schema,
      saveBytes,
      weeklyClaimedReceipts: finalSave.liveOps.weekly.claimedReceipts,
      winterClaimedGoals: finalSave.liveOps.winterEvent.claimedGoals,
      seasonClaimedTiers: finalSave.liveOps.freeSeason.claimedTiers,
      ownedCosmetics: finalSave.inventory.owned,
      layouts,
    };
  }

  try {
    await waitForHttp(webPlayUrl);
    await waitForHttp(playableUrl);

    let targets;
    for (let i = 0; i < 100; i++) {
      try {
        targets = await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json();
        break;
      } catch {
        await delay(100);
      }
    }
    if (!targets) throw new Error("Chrome debugging unavailable");
    socket = new WebSocket(targets.find(t => t.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    socket.addEventListener("message", event => {
      const m = JSON.parse(event.data);
      if (m.id) {
        const p = pending.get(m.id);
        if (p) {
          clearTimeout(p.timer);
          pending.delete(m.id);
          if (m.error) p.reject(new Error(JSON.stringify(m.error)));
          else p.resolve(m.result);
        }
      }
      if (m.method === "Runtime.exceptionThrown") {
        errors.push(m.params.exceptionDetails.text);
      }
      if (m.method === "Network.requestWillBeSent" && trackingPlayableRequests) {
        const reqUrl = m.params.request.url;
        if (
          !reqUrl.startsWith(playableUrl) &&
          !reqUrl.startsWith("data:") &&
          !reqUrl.startsWith("blob:") &&
          reqUrl !== "https://www.youtube.com/game_api/v1"
        ) {
          playableNetworkUrls.push(reqUrl);
        }
      }
    });
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Network.setBlockedURLs", { urls: ["https://www.youtube.com/game_api/*"] });

    // Verify Web /content/active endpoint directly
    const contentRes = await fetch(`${webOrigin}/content/active`);
    assert.equal(contentRes.status, 200);
    const cacheHeader = contentRes.headers.get("cache-control") || "";
    assert(cacheHeader.includes("max-age=900"));
    const contentBody = await contentRes.json();
    assert.equal(contentBody.status, "ok");
    assert.equal(contentBody.ttlSeconds, 900);

    const webResult = await verifyPlatform("web", webPlayUrl);
    const playableResult = await verifyPlatform("playable", playableUrl);
    assert.deepEqual(playableNetworkUrls, [], "Playable must make zero external network requests");
    assert.deepEqual(errors, []);

    const evidence = {
      phase: "C7",
      title: "Weekly Contracts, Perfect Rush, Skyline Sprint, Winter Event, Free Season, Web LiveOps Config & Adaptive Audio",
      verifiedAt: new Date().toISOString(),
      schema: 5,
      web: {
        ...webResult,
        liveOpsEndpoint: {
          status: contentRes.status,
          cacheControl: cacheHeader,
          revision: contentBody.revision,
          ttlSeconds: contentBody.ttlSeconds,
          catalogIds: contentBody.catalogIds,
        },
      },
      playable: {
        ...playableResult,
        externalNetworkRequests: playableNetworkUrls.length,
        runtimeAudioExternalBytes: 0,
      },
    };

    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
    console.log("C7 validation evidence written to", evidencePath);
  } finally {
    socket?.close();
    chrome.kill();
    webProc.kill();
    playableServer.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
