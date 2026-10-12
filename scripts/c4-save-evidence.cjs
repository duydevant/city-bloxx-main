const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const Module = require("node:module");
const root = path.resolve(__dirname,"..");
const esbuild = Module.createRequire(path.join(root,"base-playable-main/package.json"))("esbuild");
const code = esbuild.buildSync({entryPoints:[path.join(root,"packages/city-bloxx-core/src/index.ts")],bundle:true,platform:"node",format:"cjs",write:false}).outputFiles[0].text;
const compiled = new Module(path.join(root,"tmp/c4-core.cjs"));
compiled._compile(code,compiled.id);
const core = compiled.exports;
const fixture = require("../packages/city-bloxx-core/fixtures/quick-mixed-v13.json");
const pending = require("../packages/city-bloxx-core/fixtures/city-pending-v12.json");
const out = path.join(root,"tmp/c4-qa");fs.mkdirSync(out,{recursive:true});
const city = core.beginCityTower(core.emptySave().city,12,"residential",42);
city.pending.checkpoint = pending.checkpoint;
const before = {schema:3,standardQuickBest:88,assistQuickBest:22,runs:10,city,lastReplay:fixture};
let save = core.initializeTracking(core.migrateSave(before),"audit-install",1791417600000);
assert.deepEqual(save.city.pending.checkpoint,before.city.pending.checkpoint);
const cityRun = core.allocateRun(save,1791417600000);save=cityRun.save;
save.tracking.pendingCity={...cityRun.context,cityRunId:save.city.pending.runId};
const migrated = JSON.parse(JSON.stringify(save));
const game = new core.QuickTowerGame(fixture.config);
for(const input of fixture.inputs){game.advanceTicks(input.tick-game.getTick());game.drop(input.fraction/1000);}
game.advanceTicks(fixture.endTick-game.getTick());assert.deepEqual(game.getRecord(),fixture);
let first;
for(let i=0;i<70;i++){
  const allocated=core.allocateRun(save,1791417600000+i);
  const summary=core.makeSummary(game,allocated.context,1791417601000+i);
  first ||= summary;
  save=core.settleRun(allocated.save,summary,fixture);
}
save=core.prepareSave(save);
assert.equal(core.settleRun(save,first),save);
assert.equal(save.history.length,50);
assert.equal(save.stats.totals.attempts,70);
assert.equal(save.progression.xp,70*core.runXP(first)+100);
assert.equal(save.progression.masteryXP.residential,70*core.runXP(first));
assert.deepEqual(save.tracking.settled,[[1,1],[3,72]]);
assert.deepEqual(save.city.pending.checkpoint,before.city.pending.checkpoint);
assert.deepEqual(core.migrateSave(save),save);
function size(value){const json=JSON.stringify(value);return {utf8:Buffer.byteLength(json),utf16:json.length*2};}
const payload=size(save),envelope=size({v:1,d:save});
assert(Math.max(payload.utf8,payload.utf16,envelope.utf8,envelope.utf16)<=core.SAVE_BUDGET_BYTES);
assert.throws(()=>core.prepareSave(save,100),/preserved/);
const sources=["packages/city-bloxx-core/src/save-state.ts","packages/city-bloxx-core/src/tracking.ts","packages/city-bloxx-renderer/src/save-controller.ts","packages/city-bloxx-renderer/src/session.ts","packages/city-bloxx-renderer/src/data-screens.ts","packages/city-bloxx-content/session-locales.ts","packages/city-bloxx-content/settlement.ts"];
const sourceHash=crypto.createHash("sha256");for(const source of sources)sourceHash.update(fs.readFileSync(path.join(root,source)));
const report={schema:4,physics:core.PHYSICS_VERSION,rewardVersion:core.RUN_REWARD_VERSION,sourceSHA256:sourceHash.digest("hex"),payload,envelope,budgetBytes:core.SAVE_BUDGET_BYTES,
  history:save.history.length,replays:save.replays.length,attempts:save.stats.totals.attempts,xp:save.progression.xp,receipts:save.tracking.settled,
  preserved:"legacy v12 pending/PB/counters; receipts and XP survive 70 settlements and pruning; repeated settlement is a no-op; mandatory budget refusal leaves original unchanged"};
for(const [name,value] of [["save-before-schema3",before],["save-after-migration",migrated],["save-after-70-runs",save],["save-size-report",report]])fs.writeFileSync(path.join(out,name+".json"),JSON.stringify(value,null,2));
console.log(JSON.stringify(report,null,2));
