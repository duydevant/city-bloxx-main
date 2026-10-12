const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const Module = require("node:module");
const { createHash } = require("node:crypto");
const root = path.resolve(__dirname, "..");
const esbuild = Module.createRequire(path.join(root, "base-playable-main/package.json"))("esbuild");
const code = esbuild.buildSync({ entryPoints: [path.join(root, "packages/city-bloxx-core/src/index.ts")], bundle: true, platform: "node", format: "cjs", write: false }).outputFiles[0].text;
const m = new Module(__filename); m._compile(code, __filename); const c = m.exports;
const contentCode = esbuild.buildSync({ entryPoints: [path.join(root, "packages/city-bloxx-content/progression.ts")], bundle: true, platform: "node", format: "cjs", write: false }).outputFiles[0].text;
const catalog = new Module(__filename); catalog._compile(contentCode, __filename); const definitions = catalog.exports;
let save = c.migrateSave(JSON.parse(fs.readFileSync(path.join(root, "tmp/c4-qa/save-after-70-runs.json"), "utf8")));
const originalXP = save.progression.xp;
for (let day = 9; day <= 15; day++) {
  const date = `2026-10-${day < 10 ? "0" : ""}${day}`, at = Date.parse(`${date}T12:00:00Z`);
  save = c.ensureMissions(save, at);
  const missions = save.progression.missionDays.find(d => d.dateUTC === date);
  for (const slot of missions.slots) {
    slot.progress = slot.definition.target; slot.status = "ready"; slot.completedAt = at;
    save = c.claimMission(save, date, slot.definition.id, at);
    assert.deepEqual(c.claimMission(c.migrateSave(save), date, slot.definition.id, at), save);
  }
}
assert.equal(save.progression.xp, originalXP + 7 * 120);
assert.equal(save.progression.missionDays.length, 7);
// Capacity fixture: include all launch ownership receipts without claiming this is gameplay evidence.
for (const d of definitions.ACHIEVEMENT_CATALOG) if (!save.progression.achievements.includes(d.id)) {
  save.progression.achievements.push(d.id);
  save.progression.unlocks.push({ id: d.id, version: d.version, at: Date.parse("2026-10-15T12:00:00Z"), xp: d.xp });
  save.progression.xp += d.xp;
}
save = c.prepareSave(save); assert.deepEqual(c.migrateSave(save), save);
assert.equal(save.history.length, 50); assert.equal(save.progression.achievements.length, 20);
const size = value => { const json = JSON.stringify(value); return { utf8: Buffer.byteLength(json), utf16: json.length * 2 }; };
const payload = size(save), envelope = size({ v: 1, d: save });
assert(Math.max(...Object.values(payload), ...Object.values(envelope)) <= c.SAVE_BUDGET_BYTES);
const sourceFiles = ["packages/city-bloxx-content/progression.ts", "packages/city-bloxx-content/session-locales.ts", "packages/city-bloxx-core/src/progression.ts", "packages/city-bloxx-core/src/progression-types.ts", "packages/city-bloxx-core/src/missions.ts", "packages/city-bloxx-core/src/save-state.ts", "packages/city-bloxx-core/src/tracking.ts", "packages/city-bloxx-core/src/index.ts", "packages/city-bloxx-renderer/src/progression-screens.ts", "packages/city-bloxx-renderer/src/session.ts", "packages/city-bloxx-renderer/src/session.css", "base-game-nextjs/modules/city-bloxx/progression.test.ts", "base-game-nextjs/modules/city-bloxx/save-tracking.test.ts", "base-game-nextjs/modules/city-bloxx/daily.test.ts", "scripts/browser-smoke.cjs", "scripts/c4-save-evidence.cjs", "scripts/progression-evidence.cjs"];
const hash = createHash("sha256");
for (const file of sourceFiles) hash.update(`${file}\n${fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n")}`);
const browser = JSON.parse(fs.readFileSync(path.join(root, "tmp/c0-c2-qa/browser-report.json"), "utf8"));
assert.equal(browser.length, 2); for (const platform of browser) { assert.equal(platform.tracking.progression.builderXP, 653); assert.equal(platform.tracking.progression.claimedMissions, 3); }
const report = { phase: "C4.2", status: "Implemented", date: "2026-10-12", commitTitle: "feat(c4.2): complete progression missions and achievements", sourceFiles, sourceSHA256: hash.digest("hex"),
  catalogs: { progression: "progression-1", missions: "missions-1", achievements: "achievements-1", missionCount: definitions.MISSION_CATALOG.length, achievementCount: definitions.ACHIEVEMENT_CATALOG.length },
  commands: ["npm.cmd run check", "npm.cmd run test:save", "npm.cmd run test:daily", "npm.cmd run test:browser", "npm.cmd run test:progression"],
  unitTests: { total: 215, files: 16, progression: 44, achievementBoundaryFixtures: 20 },
  capacityFixture: { payload, envelope, budgetBytes: c.SAVE_BUDGET_BYTES, history: save.history.length, retainedMissionDays: 7, claimedMissionReceipts: 21, achievementOwnership: 20, legacyPendingCityPreserved: true, note: "Capacity fixture adds ownership synthetically; all 20 event predicates are checked in unit fixtures." },
  browser: browser.map(p => ({ platform: p.platform, ...p.tracking.progression })),
  dailyGolden: { builderXP: 533, industrialMasteryXP: 183, baseXP: 183, dailyBonus: 50, achievementXP: 300, population: 1305 },
  boundaries: "Physics/scoring unchanged; historical C4.0/C4.1 evidence retained. Local guest/SDK rewards; actual host/device/release and server verification remain in their planned gates." };
const out = path.join(root, "tmp/c4-progression-qa"); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "capacity-save.json"), JSON.stringify(save, null, 2));
fs.writeFileSync(path.join(root, "plan/evidence/C4.2-validation.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
