const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const Module = require("node:module");
const { createHash } = require("node:crypto");
const root = path.resolve(__dirname, "..");
const esbuild = Module.createRequire(path.join(root, "base-playable-main/package.json"))("esbuild");
function bundle(file) {
  const code = esbuild.buildSync({ entryPoints: [path.join(root, file)], bundle: true, platform: "node", format: "cjs", write: false }).outputFiles[0].text;
  const m = new Module(file, module); m._compile(code, file); return m.exports;
}
const c = bundle("packages/city-bloxx-core/src/index.ts"), bot = bundle("base-game-nextjs/modules/city-bloxx/test-simulation.ts");
const dates = ["1970-01-01", "2024-02-29", "2026-03-08", "2026-10-09", "2026-11-01", "2026-12-31", "2027-01-01"];
function game(date = "2026-10-09") {
  const d = c.resolveDaily(date); return new c.QuickTowerGame({ mode: "daily", assist: false, seed: d.seed, building: d.classId, daily: d });
}
function until(g, predicate) {
  for (let i = 0; i < 4000; i++) { if (predicate()) return; g.advanceTicks(1); }
  throw new Error("Daily evidence tick limit");
}
function miss(g) {
  until(g, () => { const s = g.getSnapshot(), i = s.floors.length - 1; return s.phase === "swing" && Math.abs(s.current.x - (s.floors[i].x + c.floorSway(s, i))) > 115; });
  g.drop(0); until(g, () => g.getPhase() === "swing" || g.getPhase() === "ended");
}
const complete = game();
for (let i = 0; i < 20; i++) bot.placeAccurately(complete, .02);
const body = c.checkpointTower(complete);
bot.placeAccurately(complete, .02);
const roofMiss = c.restoreTower(body); miss(roofMiss);
const failed = game(); bot.placeAccurately(failed, .02); miss(failed); miss(failed); miss(failed);
const fixture = { recipe: "daily-v1", definitions: dates.map(c.resolveDaily), complete: complete.getRecord(), roofMiss: roofMiss.getRecord(), failed: failed.getRecord() };
const fixturePath = path.join(root, "packages/city-bloxx-core/fixtures/daily-v1.json");
if (process.argv.includes("--update")) fs.writeFileSync(fixturePath, JSON.stringify(fixture, null, 2) + "\n");
else assert.deepEqual(fixture, JSON.parse(fs.readFileSync(fixturePath, "utf8")), "Daily golden fixture changed");
for (const record of [fixture.complete, fixture.roofMiss, fixture.failed]) assert.deepEqual(c.verifyRecord(record).result, record.result);
let save = c.initializeTracking(c.emptySave(), "daily-evidence", Date.parse("2026-10-09T23:59:00Z"));
const initial = game(), allocated = c.allocateRun(save, Date.parse("2026-10-09T23:59:00Z")); save = allocated.save;
save.daily = c.beginDaily(save.daily, initial, allocated.context);
save.daily = c.checkpointDaily(save.daily, complete);
const summary = c.makeSummary(complete, allocated.context, Date.parse("2026-10-10T00:01:00Z"));
save = c.settleRun(save, summary, complete.getRecord());
assert.deepEqual(c.settleRun(c.migrateSave(save), summary, complete.getRecord()), save);
assert.equal(save.daily.lifetimeCreditedDays, 1); assert.deepEqual(save.daily.creditedDates, ["2026-10-09"]);
assert.equal(save.standardQuickBest, 0); assert.deepEqual(save.city.unlocked, ["residential"]);
const out = path.join(root, "tmp/c4-daily-qa"); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "settled-save.json"), JSON.stringify(save, null, 2));
const sourceFiles = ["packages/city-bloxx-content/daily.ts", "packages/city-bloxx-content/session-locales.ts", "packages/city-bloxx-core/src/daily.ts", "packages/city-bloxx-core/src/daily-state.ts", "packages/city-bloxx-core/src/run.ts", "packages/city-bloxx-core/src/replay.ts", "packages/city-bloxx-core/src/checkpoint.ts", "packages/city-bloxx-core/src/tracking.ts", "packages/city-bloxx-core/src/save-state.ts", "packages/city-bloxx-renderer/src/session.ts", "packages/city-bloxx-renderer/src/daily-screens.ts", "packages/city-bloxx-renderer/src/data-screens.ts", "packages/city-bloxx-renderer/src/session.css", "base-game-nextjs/modules/city-bloxx/daily.test.ts", "packages/city-bloxx-core/fixtures/daily-v1.json", "scripts/browser-smoke.cjs", "scripts/daily-evidence.cjs"];
const hash = createHash("sha256");
for (const file of sourceFiles) hash.update(`${file}\n${fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n")}`);
const report = { sourceFiles, sourceSHA256: hash.digest("hex"), recipe: fixture.recipe, definitions: fixture.definitions, complete: fixture.complete.result, roofMiss: fixture.roofMiss.result, failed: fixture.failed.result,
  settlement: { attempts: save.daily.days[0].attempts, creditedDates: save.daily.creditedDates, xp: save.progression.xp, bytes: c.saveByteSize(c.prepareSave(save)), idempotent: true, quickAndCityPreserved: true } };
fs.writeFileSync(path.join(out, "daily-report.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
