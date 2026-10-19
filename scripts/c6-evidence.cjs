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
const evidencePath = path.join(root, "plan", "evidence", "C6-validation.json");
const reportDir = path.join(root, "tmp", "c6-qa");
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
  const webPort = 3016;
  const playablePort = 4176;
  const debugPort = 9229;
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
    const stamp = Date.parse("2026-10-19T12:00:00Z");

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
        const base = CityBloxx.initializeTracking(CityBloxx.emptySave(), 'c6-${kind}', ${stamp});
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

    // 1. C6.1: One Drop screen, guide (EN/VI), 1-drop run, results
    await evaluate('document.querySelector("[data-open-one-drop]").click()');
    await waitFor('document.querySelector(".cb-panel h2")?.textContent?.startsWith("One Drop")');
    layouts.oneDropEntryEn = await checkPanelLayouts(kind, "one-drop-entry-en");
    await switchLanguage(kind, "vi");
    layouts.oneDropEntryVi = await checkPanelLayouts(kind, "one-drop-entry-vi");
    await switchLanguage(kind, "en");

    await evaluate('document.querySelector("[data-one-drop-guide]").click()');
    await waitFor('document.querySelector(".cb-panel h2")?.textContent?.includes("Rules")');
    layouts.oneDropGuideEn = await checkPanelLayouts(kind, "one-drop-guide-en");
    await switchLanguage(kind, "vi");
    layouts.oneDropGuideVi = await checkPanelLayouts(kind, "one-drop-guide-vi");
    await switchLanguage(kind, "en");
    await evaluate(`Array.from(document.querySelectorAll('.cb-game button')).find(b => b.textContent === 'Back').click()`);

    const beforeOneDrop = await readSave();
    await evaluate('document.querySelector("[data-one-drop-start]").click()');
    await waitFor('document.querySelector(".cb-panel").hidden');
    await evaluate(`{
      window.__step();
      for (let i = 0; i < 18; i++) window.__step();
      document.querySelector('.cb-arena').dispatchEvent(new PointerEvent('pointerdown', { button: 0, isPrimary: true, bubbles: true }));
      for (let i = 0; i < 240 && document.querySelector('.cb-panel').hidden; i++) window.__step();
    }`);
    await delay(50);
    await waitFor('!document.querySelector(".cb-panel").hidden');
    layouts.oneDropResultEn = await checkPanelLayouts(kind, "one-drop-result-en");
    const afterOneDrop = await readSave();
    assert.equal(afterOneDrop.progression.xp, beforeOneDrop.progression.xp, "One Drop must grant 0 XP");
    assert.equal(afterOneDrop.standardQuickBest, beforeOneDrop.standardQuickBest, "One Drop must not alter Quick PB");
    assert.equal(afterOneDrop.oneDrop.days[0].attempts, 1);

    // Return Home
    await evaluate(`Array.from(document.querySelectorAll('.cb-game button')).find(b => b.textContent === 'Home').click()`);
    await waitFor('document.querySelector(".cb-panel h2")?.textContent === "Quick Tower"');

    // 2. C6.1: Placement Heatmap in Statistics
    await evaluate(`Array.from(document.querySelectorAll('.cb-game button')).find(b => b.textContent === 'Statistics').click()`);
    await evaluate('document.querySelector("[data-open-heatmap]").click()');
    await waitFor('document.querySelector("[data-heatmap]") !== null');
    layouts.heatmapEn = await checkPanelLayouts(kind, "heatmap-en");
    await switchLanguage(kind, "vi");
    layouts.heatmapVi = await checkPanelLayouts(kind, "heatmap-vi");
    await switchLanguage(kind, "en");
    const heatmapBinsCount = await evaluate('document.querySelectorAll("[data-bin-index]").length');
    assert.equal(heatmapBinsCount, 40);

    // 3. C6.3: Hall of Fame & Skyline Album in History
    await evaluate(`Array.from(document.querySelectorAll('.cb-game button')).find(b => b.textContent === 'History').click()`);
    await waitFor('document.querySelector("[data-open-hall-of-fame]") !== null');
    await evaluate('document.querySelector("[data-open-hall-of-fame]").click()');
    await waitFor('document.querySelector("[data-hall-of-fame-list]") !== null');
    layouts.hallOfFameEn = await checkPanelLayouts(kind, "hall-of-fame-en");

    await evaluate(`Array.from(document.querySelectorAll('.cb-game button')).find(b => b.textContent === 'Skyline Album').click()`);
    await waitFor('document.querySelector("[data-album-list]") !== null');
    layouts.skylineAlbumEmptyEn = await checkPanelLayouts(kind, "skyline-album-empty-en");
    await evaluate('document.querySelector("[data-album-capture=\\"0\\"]").click()');
    await delay(40);
    layouts.skylineAlbumCapturedEn = await checkPanelLayouts(kind, "skyline-album-captured-en");
    // Overwrite confirmation dialog on occupied slot 0
    await evaluate('document.querySelector("[data-album-capture=\\"0\\"]").click()');
    await waitFor('document.querySelector(".cb-panel h2")?.textContent?.includes("Replace")');
    layouts.skylineAlbumOverwriteConfirmEn = await checkPanelLayouts(kind, "skyline-album-overwrite-en");
    await evaluate(`Array.from(document.querySelectorAll('.cb-game button')).find(b => b.textContent === 'Confirm replace').click()`);
    await delay(40);
    await switchLanguage(kind, "vi");
    layouts.skylineAlbumVi = await checkPanelLayouts(kind, "skyline-album-vi");
    await switchLanguage(kind, "en");

    const afterAlbum = await readSave();
    assert.equal(afterAlbum.album.filter(Boolean).length, 1);
    assert.equal(afterAlbum.progression.xp, beforeOneDrop.progression.xp, "Skyline Album capture must grant 0 XP");
    assert(!JSON.stringify(afterAlbum).includes("data:image/"), "GameSave must never store base64 images");

    // 4. C6.2: Replay Viewer speed & seek controls on Golden Quick replay
    await evaluate(`Array.from(document.querySelectorAll('.cb-game button')).find(b => b.textContent === 'History').click()`);
    await waitFor('document.querySelectorAll("[data-history-id]").length >= 2');
    // Click the Golden Quick run (second history entry, since One Drop is first)
    await evaluate('document.querySelectorAll("[data-history-id]")[1].click()');
    await waitFor('document.querySelector("[data-toggle-hof]") !== null');
    await evaluate('document.querySelector("[data-toggle-hof]").click()');
    await evaluate(`Array.from(document.querySelectorAll('.cb-game button')).find(b => b.textContent === 'Replay').click()`);
    await waitFor('!document.querySelector("[data-replay-controls]").hidden');
    await evaluate("window.__step(); window.__step()");
    const replayControlsState = await evaluate(`(() => {
      const speeds = [...document.querySelectorAll('[data-replay-speed]')].map(b => Number(b.dataset.replaySpeed));
      document.querySelector('[data-replay-speed="2"]').click();
      const speedAfterClick = document.querySelector('[data-replay-speed="2"]').getAttribute('aria-pressed');
      const select = document.querySelector('[data-replay-drop-select]');
      const markerOptions = select.options.length;
      select.value = '1';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      const floorsAtDrop1 = Number(document.querySelector('[data-floors]').textContent);
      document.querySelector('[data-replay-seek-result]').click();
      const tickLabelAtEnd = document.querySelector('[data-replay-tick]').textContent;
      return { speeds, speedAfterClick, markerOptions, floorsAtDrop1, tickLabelAtEnd };
    })()`);
    assert.deepEqual(replayControlsState.speeds, [0.5, 1, 2, 4]);
    assert.equal(replayControlsState.speedAfterClick, "true");
    assert.equal(replayControlsState.markerOptions, 12);
    assert.equal(replayControlsState.floorsAtDrop1, 2);
    assert.equal(replayControlsState.tickLabelAtEnd, `${fixture.endTick}/${fixture.endTick}t`);

    const finalSave = await readSave();
    const saveJson = JSON.stringify(finalSave);
    const saveBytes = Math.max(Buffer.byteLength(saveJson), saveJson.length * 2);
    assert(saveBytes <= 256 * 1024);

    return {
      schema: finalSave.schema,
      saveBytes,
      oneDropAttempts: finalSave.oneDrop.days[0].attempts,
      oneDropBest: finalSave.oneDrop.allTimeBest,
      heatmapBins: heatmapBinsCount,
      replayControls: replayControlsState,
      albumSnapshots: finalSave.album.filter(Boolean).length,
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
    });
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Network.setBlockedURLs", { urls: ["https://www.youtube.com/game_api/*"] });

    const webResult = await verifyPlatform("web", webPlayUrl);
    const playableResult = await verifyPlatform("playable", playableUrl);

    // 5. C6.3: Web-only Social routes (/towers/[id], /players/[id], /challenges/[id]) & 1200x630 Share Card PNG
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send("Page.navigate", { url: `${webOrigin}/towers/tower-1` });
    await waitFor('document.querySelector("[data-public-tower=\\"tower-1\\"]") !== null');
    await waitFor('document.querySelector("[data-share-card-img]")?.complete === true');
    const towerPageCheck = await evaluate(`(() => {
      const img = document.querySelector('[data-share-card-img]');
      const bodyText = document.body.innerText;
      const beatLink = document.querySelector('[data-beat-this-tower-link]');
      return {
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        ownerDisplayed: bodyText.includes('Skyline Builder'),
        noPrivateLeak: !bodyText.includes('private-architect@example.com') && !bodyText.includes('198.51.100.42'),
        hasBeatLink: Boolean(beatLink),
        challengeId: beatLink?.dataset.beatThisTowerLink ?? null,
      };
    })()`);
    assert.equal(towerPageCheck.naturalWidth, 1200);
    assert.equal(towerPageCheck.naturalHeight, 630);
    assert.equal(towerPageCheck.ownerDisplayed, true);
    assert.equal(towerPageCheck.noPrivateLeak, true);
    assert.equal(towerPageCheck.hasBeatLink, true);
    assert(towerPageCheck.challengeId);

    // Owner revoke transitions tower page to unavailable
    await evaluate('document.querySelector("[data-revoke-tower=\\"tower-1\\"]").click()');
    await waitFor('document.querySelector("[data-public-tower-status=\\"unavailable\\"]") !== null');

    // Public Opt-in Player vs Private Player
    await send("Page.navigate", { url: `${webOrigin}/players/demo-architect` });
    await waitFor('document.querySelector("[data-public-player=\\"demo-architect\\"]") !== null');
    const publicPlayerFound = await evaluate('document.body.innerText.includes("Skyline Builder")');
    assert.equal(publicPlayerFound, true);

    await send("Page.navigate", { url: `${webOrigin}/players/private-player` });
    await waitFor('document.querySelector("[data-public-player-status=\\"unavailable\\"]") !== null');

    // Beat This Tower Challenge page (active vs retired version)
    const activeChallengeId = towerPageCheck.challengeId;
    await send("Page.navigate", { url: `${webOrigin}/challenges/${activeChallengeId}` });
    await waitFor(`document.querySelector('[data-public-challenge=${JSON.stringify(activeChallengeId)}]') !== null`);
    await evaluate(`document.querySelector('[data-start-challenge=${JSON.stringify(activeChallengeId)}]').click()`);
    await waitFor('document.querySelector("[data-challenge-ticket-status]")?.textContent.includes("ticket-")');
    const challengeActiveStatus = await evaluate('document.querySelector("[data-challenge-ticket-status]").textContent');

    await send("Page.navigate", { url: `${webOrigin}/challenges/challenge-retired` });
    await waitFor('document.querySelector("[data-public-challenge-status=\\"version-retired\\"]") !== null');
    const retiredDisabled = await evaluate(
      'Boolean(document.querySelector("[data-challenge-retired-banner]")) && !document.querySelector("[data-start-challenge=\\"challenge-retired\\"]")',
    );
    assert.equal(retiredDisabled, true);

    // Verify Playable bundle contains zero Web social route code
    const playableJsDir = path.join(root, "base-playable-main", "dist", "assets");
    const playableFiles = fs.readdirSync(playableJsDir).filter(f => f.endsWith(".js"));
    const playableSource = playableFiles.map(f => fs.readFileSync(path.join(playableJsDir, f), "utf8")).join("\n");
    const playableHasWebSocial =
      playableSource.includes("data-public-tower") ||
      playableSource.includes("Beat This Tower") ||
      playableSource.includes("renderShareCardPng");
    assert.equal(playableHasWebSocial, false, "Playable bundle must not include Web social modules");

    assert.deepEqual(errors, []);

    const evidence = {
      phase: "C6",
      title: "One Drop v1, Placement Heatmap, Replay Speed/Seek, Personal Ghost, Hall of Fame, Skyline Album & Web Social",
      verifiedAt: new Date().toISOString(),
      schema: 5,
      web: {
        ...webResult,
        socialRoutes: {
          towerShareCard: towerPageCheck,
          revokedTowerUnavailable: true,
          optInPlayerVisible: publicPlayerFound,
          privatePlayerHidden: true,
          challengeTicketIssued: challengeActiveStatus,
          retiredChallengeBlocked: retiredDisabled,
        },
      },
      playable: {
        ...playableResult,
        excludesWebSocial: !playableHasWebSocial,
      },
    };

    fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + "\n");
    console.log("C6 validation evidence written to", evidencePath);
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
