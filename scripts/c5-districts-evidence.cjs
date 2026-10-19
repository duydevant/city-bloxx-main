const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const esbuild = require("node:module").createRequire(path.resolve(__dirname, "../base-playable-main/package.json"))("esbuild");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "tmp/c5-evidence");
const evidenceFile = path.join(root, "plan/evidence/C5-validation.json");
const chromeCandidates = [
  process.env.CHROME_BIN,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].filter(Boolean);
const chromePath = chromeCandidates.find((candidate) => fs.existsSync(candidate));
if (!chromePath) throw new Error("Chrome or Edge executable is required for C5 evidence");

const coreBundle = esbuild.buildSync({
  entryPoints: [path.join(root, "packages/city-bloxx-core/src/index.ts")],
  bundle: true,
  platform: "browser",
  format: "iife",
  globalName: "CityBloxx",
  write: false,
}).outputFiles[0].text;

const viewports = [
  { name: "320x568", width: 320, height: 568 },
  { name: "390x844", width: 390, height: 844 },
  { name: "900x430", width: 900, height: 430 },
];

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function serveStatic(dir) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const clean = decodeURIComponent((req.url || "/").split("?")[0]);
      const rel = clean === "/" ? "/index.html" : clean;
      const target = path.resolve(dir, "." + rel);
      if (!target.startsWith(path.resolve(dir)) || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
        res.writeHead(404).end("Not found");
        return;
      }
      res.writeHead(200, { "content-type": mime[path.extname(target)] || "application/octet-stream" });
      fs.createReadStream(target).pipe(res);
    });
    srv.listen(0, "127.0.0.1", () => resolve({ server: srv, port: srv.address().port }));
  });
}

function startNextServer(port) {
  const nextBin = path.join(root, "base-game-nextjs/node_modules/next/dist/bin/next");
  const child = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: path.join(root, "base-game-nextjs"),
    stdio: ["ignore", "pipe", "pipe"],
  });
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Next start timed out")), 20000);
    const check = async () => {
      for (let i = 0; i < 60; i++) {
        try {
          const res = await fetch(`http://127.0.0.1:${port}/play`);
          if (res.ok) {
            clearTimeout(timeout);
            resolve(child);
            return;
          }
        } catch {
          // wait
        }
        await delay(250);
      }
    };
    void check();
  });
}

async function connectChrome(debugPort) {
  for (let i = 0; i < 40; i++) {
    try {
      const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((r) => r.json());
      const page = targets.find((t) => t.type === "page");
      if (page?.webSocketDebuggerUrl) {
        const ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          ws.onopen = resolve;
          ws.onerror = reject;
        });
        let id = 0;
        const pending = new Map();
        ws.onmessage = (ev) => {
          const msg = JSON.parse(ev.data);
          if (msg.id && pending.has(msg.id)) {
            const { resolve, reject } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) reject(new Error(msg.error.message));
            else resolve(msg.result);
          }
        };
        const send = (method, params = {}) =>
          new Promise((resolve, reject) => {
            const msgId = ++id;
            pending.set(msgId, { resolve, reject });
            ws.send(JSON.stringify({ id: msgId, method, params }));
          });
        await send("Page.enable");
        await send("Runtime.enable");
        await send("Network.enable");
        await send("Network.setBlockedURLs", { urls: ["https://www.youtube.com/game_api/*"] });
        return { ws, send };
      }
    } catch {
      // retry
    }
    await delay(200);
  }
  throw new Error("Could not connect to Chrome DevTools");
}

async function runTarget(cdp, kind, url, storageKey) {
  const { send } = cdp;
  const evaluate = async (expression) => {
    const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) {
      throw new Error(`Eval error (${kind}): ${res.exceptionDetails.text} ${res.exceptionDetails.exception?.description || ""}`);
    }
    return res.result?.value;
  };
  const waitFor = async (expr, timeoutMs = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (await evaluate(`Boolean(${expr})`)) return;
      await delay(50);
    }
    throw new Error(`Timed out waiting for (${kind}): ${expr}`);
  };
  const clickButton = async (label) => {
    const ok = await evaluate(`(()=>{
      const btn = [...document.querySelectorAll(".cb-game button")].find(b => !b.disabled && (b.textContent.trim() === ${JSON.stringify(label)} || b.getAttribute("aria-label") === ${JSON.stringify(label)}));
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    assert(ok, `Missing button "${label}" on ${kind}`);
    await delay(40);
  };
  const switchLanguage = async (locale) => {
    if (kind === "playable") {
      const cur = await evaluate('document.querySelector(".cb-game")?.lang || "en"');
      if (cur !== locale) await evaluate('document.querySelector("[data-language]").click()');
    } else {
      await evaluate('document.querySelector("header [role=combobox]").click()');
      await waitFor('document.querySelector("[role=option]") !== null');
      await evaluate(
        `[...document.querySelectorAll('[role=option]')].find(el => el.textContent.includes(${JSON.stringify(locale === "vi" ? "Tiếng Việt" : "English")})).click()`,
      );
    }
    await waitFor(`document.querySelector(".cb-game")?.lang === ${JSON.stringify(locale)}`);
    await delay(40);
  };
  const setViewport = async (vp) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await delay(60);
    await evaluate("window.__step && window.__step()");
  };
  const checkLayout = async (stepName) => {
    const checks = {};
    for (const vp of viewports) {
      await setViewport(vp);
      const m = await evaluate(`(()=>{
        const de = document.scrollingElement;
        const panel = document.querySelector(".cb-panel");
        const pr = panel.getBoundingClientRect();
        const clipped = [...panel.querySelectorAll("button,select,[data-district-card],[data-landmark-card]")].filter(el => {
          const cs = getComputedStyle(el);
          if (el.hidden || cs.display === "none") return false;
          const r = el.getBoundingClientRect();
          return r.width < 20 || r.height < 16 || r.left < pr.left - 1 || r.top < pr.top - 1 || r.right > pr.right + 1 || r.bottom > pr.bottom + 1;
        }).map(el => el.textContent.trim().slice(0, 30));
        const lots = [...panel.querySelectorAll("[data-lot]")].map(el => el.getBoundingClientRect());
        const minLotHeight = lots.length ? Math.round(Math.min(...lots.map(r => r.height))) : null;
        return {
          overflowX: de.scrollWidth - innerWidth,
          overflowY: de.scrollHeight - innerHeight,
          clipped,
          minLotHeight,
        };
      })()`);
      assert(m.overflowX <= 1 && m.overflowY <= 1, `${kind} ${stepName} ${vp.name} overflow: ${JSON.stringify(m)}`);
      assert.equal(m.clipped.length, 0, `${kind} ${stepName} ${vp.name} clipped: ${JSON.stringify(m.clipped)}`);
      if (m.minLotHeight !== null) {
        assert(m.minLotHeight >= 24, `${kind} ${stepName} ${vp.name} lot height ${m.minLotHeight} < 24`);
      }
      checks[vp.name] = m;
    }
    await setViewport(viewports[1]);
    return checks;
  };
  const navigateWithSave = async (rawSaveObj) => {
    const encoded =
      rawSaveObj === null
        ? null
        : kind === "web"
          ? JSON.stringify(rawSaveObj)
          : JSON.stringify({ v: 1, d: rawSaveObj });
    const script = await send("Page.addScriptToEvaluateOnNewDocument", {
      source: `
        window.__frameCount=0;window.__frames=new Map();window.__rafId=0;
        window.requestAnimationFrame=cb=>{const id=++window.__rafId;window.__frames.set(id,cb);return id};
        window.cancelAnimationFrame=id=>window.__frames.delete(id);
        window.__step=()=>{const entries=[...window.__frames.values()];window.__frames.clear();const time=100+(++window.__frameCount)*1000/60;entries.forEach(cb=>cb(time))};
        window.__clock=1792380000000;Date.now=()=>window.__clock;
        ${coreBundle}
        localStorage.setItem("base-game.locale", "en");
        ${encoded === null ? `localStorage.removeItem(${JSON.stringify(storageKey)});` : `localStorage.setItem(${JSON.stringify(storageKey)}, ${JSON.stringify(encoded)});`}
      `,
    });
    await send("Page.navigate", { url });
    await waitFor('window.CityBloxx && document.querySelector(".cb-panel h2")?.textContent === "Quick Tower"');
    await evaluate("for(let i=0;i<4;i++)window.__step()");
    await send("Page.removeScriptToEvaluateOnNewDocument", { identifier: script.identifier });
  };
  const readSave = () =>
    evaluate(`(()=>{
      const raw = JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)}));
      return ${kind === "web" ? "raw" : "raw.d"};
    })()`);
  const driveCity = async (record) => {
    await evaluate(`{
      window.__step();
      const arena = document.querySelector(".cb-arena");
      const record = ${JSON.stringify(record)};
      let index = 0;
      for (let tick = 0; tick < record.endTick; tick++) {
        if (record.inputs[index]?.tick === tick) {
          arena.dispatchEvent(new PointerEvent("pointerdown", { button: 0, isPrimary: true, bubbles: true }));
          index++;
        }
        window.__step();
      }
      for (let i = 0; i < 240; i++) window.__step();
    }`);
    await delay(50);
  };

  await setViewport(viewports[1]);
  await navigateWithSave(null);

  // 1. Fresh save has schema 5, activeDistrict downtown, Harbor locked
  await clickButton("Build City");
  const initialMapLayout = await checkLayout("downtown-initial-map");
  await clickButton("Districts");
  const pickerPage0Layout = await checkLayout("districts-page0-downtown");
  await clickButton("Next");
  const lockedHarborText = await evaluate('document.querySelector(".cb-panel").innerText');
  assert(
    lockedHarborText.includes("Harbor · Locked") &&
      lockedHarborText.includes("Unlock Requirement: Complete Downtown Goal") &&
      lockedHarborText.includes("0/12") &&
      lockedHarborText.includes("0/8,000"),
    `Unexpected locked Harbor text: ${lockedHarborText}`,
  );
  const pickerPage1LockedLayout = await checkLayout("districts-page1-harbor-locked");

  // 2. Seed Schema 4 save with 11 Downtown towers (1 tower away from completing Downtown goal: 12 towers, 4 classes, >=8000 pop, >=3 A/S), migrate -> Schema 5
  const nearGoalSave = await evaluate(`(()=>{
    const base = CityBloxx.emptySave();
    base.city.unlocked = ["residential", "industrial", "office", "highrise"];
    let seq = 1;
    const make = (id, floors, pop, rating) => ({
      runId: "city-" + (seq++),
      classId: id,
      floors,
      population: pop,
      rating,
      roof: true,
      complete: true,
      accuracy: 96,
      skin: "default",
      roofSkin: "default",
    });
    base.city.lots[0] = make("residential", 10, 800, "S");
    base.city.lots[1] = make("industrial", 20, 900, "A");
    base.city.lots[2] = make("office", 30, 1100, "S");
    base.city.lots[3] = make("highrise", 40, 1400, "A");
    for (let i = 4; i < 11; i++) {
      base.city.lots[i] = make("residential", 10, 600, "B");
    }
    base.city.nextRun = seq;
    const { districts, ...schema4 } = base;
    schema4.schema = 4;
    return schema4;
  })()`);
  await navigateWithSave(nearGoalSave);
  await clickButton("Build City");
  const migratedFrom4 = await readSave();
  assert.equal(migratedFrom4.schema, 5);
  assert.deepEqual(migratedFrom4.districts.unlockedDistricts, ["downtown"]);

  // Build the 12th Downtown tower on lot 11 to cross the Downtown completion threshold
  await evaluate('document.querySelector(\'[data-lot="11"]\').click()');
  await clickButton("Build selected lot");
  await waitFor('document.querySelector(".cb-panel").hidden');
  const pendingSeed = (await readSave()).city.pending.checkpoint.config.seed;
  const planned = await evaluate(`(()=>{
    const g = new CityBloxx.QuickTowerGame({ seed: ${pendingSeed}, mode: "city", building: "residential", assist: false });
    for (let tick = 0; tick < 15000 && g.getPhase() !== "ended"; tick++) {
      const s = g.getSnapshot(), idx = s.floors.length - 1, top = idx >= 0 ? s.floors[idx].x + CityBloxx.floorSway(s, idx) : 0;
      if (s.phase === "swing" && Math.abs(s.current.x - top) < 3) g.drop(0);
      g.advanceTicks(1);
    }
    return g.getRecord();
  })()`);
  await driveCity(planned);
  await waitFor('document.querySelector(".cb-panel h2")?.textContent.includes("City tower complete")');
  await clickButton("Accept building");

  // Harbor Unlock Modal must appear!
  const unlockModalText = await evaluate('document.querySelector(".cb-panel").innerText');
  assert(unlockModalText.includes("Harbor District Unlocked!"), `Expected Harbor unlock modal, got: ${unlockModalText}`);
  const unlockModalLayout = await checkLayout("harbor-unlock-modal");

  // Click "Enter Harbor" to switch directly to Harbor
  await clickButton("Enter Harbor");
  await waitFor('document.querySelector(\'[data-district="harbor"]\')');
  const harborMapState = await evaluate(`({
    activeDistrict: document.querySelector(".cb-city-grid")?.dataset?.district,
    bgStyle: document.querySelector(".cb-city-grid")?.style?.backgroundImage || "",
    heading: document.querySelector(".cb-panel h2")?.textContent,
    occupiedLots: [...document.querySelectorAll("[data-lot] img")].length,
  })`);
  assert.equal(harborMapState.activeDistrict, "harbor");
  assert(harborMapState.bgStyle.includes("bg_harbor_default_map.png"), harborMapState.bgStyle);
  assert.equal(harborMapState.occupiedLots, 0, "Harbor lots must be independent from Downtown lots");
  const harborMapLayout = await checkLayout("harbor-map-en");

  // Demolish test: switch back to Downtown, demolish lot 11, verify Harbor stays unlocked & Downtown completion receipt persists
  await clickButton("Districts");
  await clickButton("Previous");
  await clickButton("Open Downtown");
  await waitFor('document.querySelector(\'[data-district="downtown"]\')');
  await evaluate('document.querySelector(\'[data-lot="11"]\').click()');
  await clickButton("Demolish");
  await clickButton("Confirm demolition");
  const afterDemolishSave = await readSave();
  assert(afterDemolishSave.districts.unlockedDistricts.includes("harbor"), "Harbor must remain unlocked after demolish");
  assert(afterDemolishSave.districts.completedDistricts.includes("downtown"), "Downtown completion receipt must persist after demolish");

  // 3. Seed Harbor completion (16 towers, >=12,000 pop, >=5 A/S) + total population >= 50,000 to reach Megacity, claim & place Dock Clock Tower landmark
  const harborCompleteSave = await evaluate(`(()=>{
    const s = ${JSON.stringify(afterDemolishSave)};
    const hLots = Array.from({ length: 25 }, () => null);
    let seq = 20;
    const makeTower = (id, floors, pop, rating) => ({
      runId: "city-" + (seq++),
      classId: id,
      floors,
      population: pop,
      rating,
      roof: true,
      complete: true,
      accuracy: 96,
      skin: "default",
      roofSkin: "default",
    });
    for (let i = 0; i < 16; i++) {
      const id = ["residential", "industrial", "office", "highrise"][i % 4];
      const floors = [10, 20, 30, 40][i % 4];
      hLots[i] = makeTower(id, floors, 3000, i < 8 ? "S" : "A");
    }
    s.city.nextRun = seq;
    s.districts.activeDistrict = "harbor";
    s.districts.harbor.lots = hLots;
    return CityBloxx.migrateSave(s);
  })()`);
  await navigateWithSave(harborCompleteSave);
  await clickButton("Build City");
  await clickButton("Districts");
  // Since activeDistrict is harbor, Districts opens on page 1 (Harbor); click Next to reach page 2 (Landmark & Evolution)
  await clickButton("Next");
  const beforeClaimText = await evaluate('document.querySelector(".cb-panel").innerText');
  assert(beforeClaimText.includes("Dock Clock Tower") && beforeClaimText.includes("Ready to Claim!"), beforeClaimText);
  await clickButton("Claim Landmark");
  const afterClaimText = await evaluate('document.querySelector(".cb-panel").innerText');
  assert(afterClaimText.includes("Placed in Plaza ✓"), afterClaimText);
  const landmarkPageEnLayout = await checkLayout("districts-page2-landmark-en");

  // Verify VI localization on Landmark & Evolution page
  await switchLanguage("vi");
  const afterClaimViText = await evaluate('document.querySelector(".cb-panel").innerText');
  assert(
    afterClaimViText.includes("Tháp Đồng hồ Cảng") && afterClaimViText.includes("Các cấp phát triển Đô thị"),
    afterClaimViText,
  );
  const landmarkPageViLayout = await checkLayout("districts-page2-landmark-vi");
  await switchLanguage("en");

  // Back to Harbor Map and verify dedicated landmark slot outside 25-lot grid + image natural dimensions
  await clickButton("Back");
  await waitFor('document.querySelector(\'[data-landmark-slot="dock_clock_tower"] img\')?.complete');
  const landmarkSlotInfo = await evaluate(`(()=>{
    const slot = document.querySelector('[data-landmark-slot="dock_clock_tower"]');
    const img = slot?.querySelector("img");
    const gridLots = document.querySelectorAll(".cb-city-grid [data-lot]").length;
    const insideGrid = Boolean(slot && slot.closest(".cb-city-grid"));
    return {
      exists: Boolean(slot),
      title: slot?.getAttribute("title"),
      insideGrid,
      gridLots,
      imgComplete: Boolean(img?.complete),
      naturalWidth: img?.naturalWidth || 0,
      naturalHeight: img?.naturalHeight || 0,
      evolutionStage: document.querySelector(".cb-city-grid")?.dataset?.evolutionStage,
      highestStage: document.querySelector(".cb-city-grid")?.dataset?.highestStage,
    };
  })()`);
  assert.equal(landmarkSlotInfo.exists, true);
  assert.equal(landmarkSlotInfo.insideGrid, false, "Landmark slot must be outside the 25-lot grid");
  assert.equal(landmarkSlotInfo.gridLots, 25);
  assert.equal(landmarkSlotInfo.imgComplete, true);
  assert.equal(landmarkSlotInfo.naturalWidth, 256);
  assert.equal(landmarkSlotInfo.naturalHeight, 384);
  assert.equal(landmarkSlotInfo.evolutionStage, "megacity");
  assert.equal(landmarkSlotInfo.highestStage, "megacity");
  const harborWithLandmarkLayout = await checkLayout("harbor-map-with-landmark");

  const finalSave = await readSave();
  return {
    schema: finalSave.schema,
    unlockedDistricts: finalSave.districts.unlockedDistricts,
    completedDistricts: finalSave.districts.completedDistricts,
    landmark: finalSave.districts.landmarks.dock_clock_tower,
    evolution: finalSave.districts.evolution,
    landmarkSlotInfo,
    layouts: {
      initialMapLayout,
      pickerPage0Layout,
      pickerPage1LockedLayout,
      unlockModalLayout,
      harborMapLayout,
      landmarkPageEnLayout,
      landmarkPageViLayout,
      harborWithLandmarkLayout,
    },
  };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(path.dirname(evidenceFile), { recursive: true });

  const nextPort = await freePort();
  const nextProc = await startNextServer(nextPort);
  const playableSrv = await serveStatic(path.join(root, "base-playable-main/dist"));
  const debugPort = await freePort();
  const userDataDir = path.join(outDir, "chrome-profile-" + Date.now());
  const chrome = spawn(
    chromePath,
    [
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${userDataDir}`,
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-first-run",
      "--no-default-browser-check",
      "about:blank",
    ],
    { windowsHide: true, stdio: "ignore" },
  );

  try {
    const cdp = await connectChrome(debugPort);
    const webResult = await runTarget(cdp, "web", `http://127.0.0.1:${nextPort}/play`, "city-bloxx.quick-save.v2");
    const playableResult = await runTarget(
      cdp,
      "playable",
      `http://127.0.0.1:${playableSrv.port}/index.html`,
      "city_bloxx_save_v1",
    );
    cdp.ws.close();

    const report = {
      phase: "C5",
      title: "Harbor District, District Goals, Dock Clock Tower Landmark & City Evolution",
      verifiedAt: new Date().toISOString(),
      schema: 5,
      assets: {
        harborMap: {
          logicalPath: "bg/harbor/bg_harbor_default_map.png",
          width: 1536,
          height: 1024,
        },
        harborThumb: {
          logicalPath: "bg/harbor/bg_harbor_default_thumb.png",
          width: 512,
          height: 512,
        },
        landmarkMini: {
          logicalPath: "city/harbor/landmark_dock_clock_tower_mini.png",
          width: 256,
          height: 384,
          anchor: { x: 128, y: 320 },
        },
      },
      web: webResult,
      playable: playableResult,
    };

    fs.writeFileSync(evidenceFile, JSON.stringify(report, null, 2) + "\n");
    console.log("C5 evidence written to", evidenceFile);
  } finally {
    chrome.kill();
    nextProc.kill();
    playableSrv.server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
