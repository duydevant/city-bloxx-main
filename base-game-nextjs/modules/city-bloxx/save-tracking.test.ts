import { describe, expect, it } from "vitest"
import { acceptCityTower, allocateRun, beginCityTower, BUILDINGS, cancelCityTower, checkpointTower, emptySave, initializeTracking, isSettled, makeSummary, migrateSave, perfectRate, pinReplay, prepareSave, QuickTowerGame, restoreTower, runXP, saveByteSize, SAVE_BUDGET_BYTES, settleRun, updateCityCheckpoint, type GameSave, type RunConfig, type RunRecord } from "../../../packages/city-bloxx-core/src/index"
import golden from "../../../packages/city-bloxx-core/fixtures/quick-mixed-v13.json"
import legacy10 from "../../../packages/city-bloxx-core/fixtures/city-pending-v10.json"
import legacy11 from "../../../packages/city-bloxx-core/fixtures/city-pending-v11.json"
import legacy12 from "../../../packages/city-bloxx-core/fixtures/city-pending-v12.json"
import { placeAccurately } from "./test-simulation"

function fixtureGame(assist = false) {
  const game = new QuickTowerGame({ ...golden.config, assist } as RunConfig)
  for (const input of golden.inputs) { game.advanceTicks(input.tick - game.getTick()); game.drop(input.fraction / 1000) }
  game.advanceTicks(golden.endTick - game.getTick())
  return game
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
function initial() { return initializeTracking(emptySave(), "test-install", 1000) }
function miss(game: QuickTowerGame) {
  for (let i = 0; i < 4000; i++) {
    const s = game.getSnapshot(), top = s.floors[s.floors.length - 1]?.x ?? 0
    if (s.phase === "swing" && Math.abs(s.current.x - top) > 150) { game.drop(0); break }
    game.advanceTicks(1)
  }
  for (let i = 0; i < 4000 && !["swing", "ended"].includes(game.getPhase()); i++) game.advanceTicks(1)
}
describe("C4.0 save and tracking", () => {
  it("keeps the physics fixture byte-for-byte unchanged and tracks resolved body outcomes separately", () => {
    const game = fixtureGame(), m = game.getMetrics(), result = game.getResult()
    expect(game.getRecord()).toEqual(golden)
    expect(m.foundation).toBe(1)
    expect(Object.values(m.body).reduce((sum, n) => sum + n, 0)).toBe(result.height - 1 + result.misses)
    expect(m.body.perfect).toBe(result.perfectCount)
    expect(m.body.miss).toBe(3)
    expect(m.roof).toBeNull()
    expect(m.signedErrors).toHaveLength(m.errorCount)
    expect(m.signedErrorSum).toBeCloseTo(m.signedErrors.reduce((sum, n) => sum + n, 0), 3)
  })
  it("settles a run once across repeated results and reloads", () => {
    const game = fixtureGame(), allocation = allocateRun(initial(), 1000)
    const summary = makeSummary(game, allocation.context, 2000)
    const once = settleRun(allocation.save, summary, game.getRecord())
    expect(settleRun(once, summary, game.getRecord())).toBe(once)
    const loaded = migrateSave(copy(once))
    expect(settleRun(loaded, summary)).toBe(loaded)
    expect(loaded.runs).toBe(1); expect(loaded.stats.totals.attempts).toBe(1)
    expect(loaded.history).toHaveLength(1)
    expect(loaded.progression.xp).toBe(runXP(summary))
    expect(loaded.progression.masteryXP.residential).toBe(runXP(summary))
    expect(loaded.history[0].xpEarned).toBe(runXP(summary))
    expect(loaded.stats.totals.scoredBody).toBe(summary.metrics!.errorCount)
    expect(perfectRate(loaded.stats.totals)).toBeCloseTo(summary.metrics!.body.perfect / summary.metrics!.errorCount * 100, 1)
  })
  it("does not confuse accuracy with Perfect rate or double-count the foundation", () => {
    const game = new QuickTowerGame(42)
    placeAccurately(game, .02)
    const allocation = allocateRun(initial(), 1000)
    const save = settleRun(allocation.save, makeSummary(game, allocation.context, 2000, "abandoned"))
    expect(save.stats.totals.quality.good).toBe(0)
    expect(perfectRate(save.stats.totals)).toBeNull()
    expect(save.stats.totals.abandoned).toBe(1)
    expect(save.standardQuickBest).toBe(0); expect(save.runs).toBe(0)
    expect(save.progression.xp).toBe(0)
  })
  it("keeps settlement receipts after pruning more than 50 summaries", () => {
    const game = fixtureGame(); let save = initial()
    let first: ReturnType<typeof makeSummary> | null = null
    for (let i = 0; i < 70; i++) {
      const allocation = allocateRun(save, 1000 + i)
      const summary = makeSummary(game, allocation.context, 2000 + i)
      if (!first) first = summary
      save = settleRun(allocation.save, summary, game.getRecord())
    }
    expect(save.history).toHaveLength(50)
    expect(save.tracking.settled).toEqual([[1, 70]])
    expect(save.stats.totals.attempts).toBe(70)
    expect(save.progression.xp).toBe(70 * runXP(first!))
    expect(settleRun(save, first!)).toBe(save)
    expect(saveByteSize(prepareSave(save))).toBeLessThan(SAVE_BUDGET_BYTES)
    expect(migrateSave(copy(save)).stats).toEqual(save.stats)
  })
  it("supports a paused City identity gap while later Quick runs settle", () => {
    let save = initial()
    save.city = beginCityTower(save.city, 12, "residential", 42)
    const cityAllocation = allocateRun(save, 1000); save = cityAllocation.save
    save.tracking.pendingCity = { ...cityAllocation.context, cityRunId: save.city.pending!.runId }
    const game = fixtureGame()
    for (let i = 0; i < 60; i++) {
      const q = allocateRun(save, 1100 + i)
      save = settleRun(q.save, makeSummary(game, q.context, 2000 + i), game.getRecord())
    }
    expect(save.tracking.settled).toEqual([[2, 61]])
    expect(migrateSave(copy(save)).tracking.pendingCity).toEqual(save.tracking.pendingCity)
    const city = restoreTower(save.city.pending!.checkpoint)
    const stopped = makeSummary(city, cityAllocation.context, 3000, "abandoned")
    save = settleRun(save, stopped)
    expect(save.tracking.settled).toEqual([[1, 61]])
    expect(isSettled(save, cityAllocation.context.identity)).toBe(true)
  })
  it("separates completed City attempts from accepted placements and roofs from body stats", () => {
    const city = new QuickTowerGame({ seed: 42, mode: "city", assist: false, building: "residential" })
    for (let i = 0; i <= BUILDINGS.residential.floors; i++) placeAccurately(city, .02)
    const m = city.getMetrics()
    expect(m.foundation).toBe(1); expect(m.body.perfect).toBe(9); expect(m.roof).toBe("perfect")
    const allocation = allocateRun(initial(), 1000)
    allocation.save.city = updateCityCheckpoint(beginCityTower(allocation.save.city, 12, "residential", 42), city)
    allocation.save.tracking.pendingCity = { ...allocation.context, cityRunId: allocation.save.city.pending!.runId }
    let save = settleRun(allocation.save, makeSummary(city, allocation.context, 2000))
    expect(save.stats.byClass.residential.completed).toBe(1); expect(save.city.stats.builds).toBe(0)
    expect(save.stats.totals.roof.perfect).toBe(1); expect(save.stats.totals.scoredBody).toBe(9)
    expect(save.progression.xp).toBe(9 * 7 + 50)
    save = { ...save, city: acceptCityTower(save.city, save.city.pending!.runId), tracking: { ...save.tracking, pendingCity: null } }
    expect(migrateSave(copy(save)).stats.totals.attempts).toBe(1)
    expect(save.city.stats.builds).toBe(1); expect(save.standardQuickBest).toBe(0)
    expect(settleRun(save, makeSummary(city, allocation.context, 2000))).toBe(save)
    expect(save.progression.xp).toBe(113)
  })
  it("counts a roof Miss once without polluting body Miss/Perfect rate", () => {
    const city = new QuickTowerGame({ seed: 42, mode: "city", assist: false, building: "residential" })
    for (let i = 0; i < 10; i++) placeAccurately(city, .02)
    miss(city)
    expect(city.getPhase()).toBe("ended")
    expect(city.getMetrics().body.miss).toBe(0); expect(city.getMetrics().roof).toBe("miss")
    expect(city.getResult().misses).toBe(1)
    const allocation = allocateRun(initial(), 1000)
    expect(settleRun(allocation.save, makeSummary(city, allocation.context, 2000)).progression.xp).toBe(113)
  })
  it("retains City skill rewards when keeping the old building or cancelling a rebuild", () => {
    const game = new QuickTowerGame({ seed: 42, mode: "city", assist: false, building: "residential" })
    for (let i = 0; i <= 10; i++) placeAccurately(game, .02)
    let save = initial()
    save.city = updateCityCheckpoint(beginCityTower(save.city, 12, "residential", 42), game)
    save.city = acceptCityTower(save.city, save.city.pending!.runId)
    const old = copy(save.city.lots[12])
    save.city = updateCityCheckpoint(beginCityTower(save.city, 12, "residential", 42), game)
    const q = allocateRun(save, 1000), summary = makeSummary(game, q.context, 2000)
    save = settleRun(q.save, summary)
    save.city = cancelCityTower(save.city)
    expect(save.city.lots[12]).toEqual(old); expect(save.progression.xp).toBe(113)
    expect(settleRun(migrateSave(copy(save)), summary).progression.xp).toBe(113)
    const partial = new QuickTowerGame({ seed: 42, mode: "city", assist: false, building: "residential" })
    placeAccurately(partial, .02); placeAccurately(partial, .02)
    const next = allocateRun(save, 3000)
    save = settleRun(next.save, makeSummary(partial, next.context, 4000, "abandoned"))
    expect(save.progression.xp).toBe(120); expect(save.stats.totals.completed).toBe(1)
  })
  it("derives XP from resolved metrics, refuses overflow and never rewards unknown legacy records", () => {
    const game = fixtureGame(), q = allocateRun(initial(), 1000), summary = makeSummary(game, q.context, 2000)
    summary.xpEarned = 999999
    expect(settleRun(q.save, summary).progression.xp).toBe(runXP(summary))
    expect(settleRun(q.save, { ...summary, metrics: null }).progression.xp).toBe(0)
    q.save.progression.xp = Number.MAX_SAFE_INTEGER
    expect(() => settleRun(q.save, summary)).toThrow("Reward bounds")
    expect(q.save.history).toHaveLength(0)
  })
  it("keeps Standard and Assist totals/PB separate", () => {
    let save = initial()
    for (const assist of [false, true]) {
      const game = new QuickTowerGame({ seed: 42, mode: "quick", assist })
      placeAccurately(game, .02); miss(game); miss(game); miss(game)
      const q = allocateRun(save, 1000); save = settleRun(q.save, makeSummary(game, q.context, 2000), game.getRecord())
    }
    expect(save.stats.byMode["quick-standard"].attempts).toBe(1)
    expect(save.stats.byMode["quick-assist"].attempts).toBe(1)
    expect(save.standardQuickBest).toBeGreaterThan(0); expect(save.assistQuickBest).toBeGreaterThan(0)
  })
  it("retains exactly latest/PB/pinned replay IDs without duplicate archives", () => {
    const game = fixtureGame(); let save = initial()
    const one = allocateRun(save, 1000); save = settleRun(one.save, makeSummary(game, one.context, 2000), game.getRecord())
    save = pinReplay(save, one.context.identity.id)
    for (let i = 0; i < 4; i++) {
      const next = allocateRun(save, 1000); save = settleRun(next.save, makeSummary(game, next.context, 2000), game.getRecord())
    }
    expect(save.replays).toHaveLength(2)
    expect(save.replayRefs.best).toBe(one.context.identity.id)
    expect(save.replayRefs.pinned).toBe(one.context.identity.id)
    expect(save.history.filter(h => h.replayStatus === "available")).toHaveLength(2)
    expect(() => pinReplay(save, "unavailable")).toThrow()
  })
  it("migrates schema 1/2/3 without inventing history/lifetime statistics", () => {
    for (const schema of [1, 2, 3]) {
      const save = migrateSave({ schema, standardQuickBest: 88, assistQuickBest: 22, runs: 10, city: emptySave().city })
      expect(save.schema).toBe(4); expect(save.runs).toBe(10)
      expect(save.history).toHaveLength(0); expect(save.stats.totals.attempts).toBe(0)
      expect(save.standardQuickBest).toBe(88)
    }
  })
  it("preserves pending v10/v11/v12 physics and checkpoints without modifying them", () => {
    for (const legacy of [legacy10, legacy11, legacy12]) {
      const city = beginCityTower(emptySave().city, 12, "residential", 42)
      city.pending!.checkpoint = legacy.checkpoint as ReturnType<typeof checkpointTower>
      const save = migrateSave({ schema: 3, city, standardQuickBest: 88 })
      expect(save.city.pending!.checkpoint).toEqual(legacy.checkpoint)
      expect(restoreTower(save.city.pending!.checkpoint).getSnapshot()).toEqual(restoreTower(city.pending!.checkpoint).getSnapshot())
    }
  })
  it("keeps incompatible old replay metadata as an unavailable summary", () => {
    const old = { ...golden, physicsVersion: "physics-0.12.0" }
    const save = migrateSave({ schema: 2, lastReplay: old, standardQuickBest: 88 })
    expect(save.lastReplay).toBeNull(); expect(save.history).toHaveLength(1)
    expect(save.history[0].replayStatus).toBe("unsupported"); expect(save.history[0].metrics).toBeNull()
    expect(save.stats.totals.attempts).toBe(0)
    const initialized = initializeTracking(save, "new-install", 1000)
    expect(migrateSave(copy(initialized)).history[0].identity.id).toBe("new-install:1")
  })
  it("persists settings and future scaffolds without issuing XP or changing inventory", () => {
    const save = initial()
    save.settings = { muted: true, reducedMotion: true, locale: "vi" }
    save.inventory.owned.push("brick-residential"); save.progression.xp = 123
    const loaded = migrateSave(copy(save))
    expect(loaded.settings).toEqual(save.settings)
    expect(loaded.inventory).toEqual(save.inventory); expect(loaded.progression.xp).toBe(123)
  })
  it("protects mandatory pending/ownership/receipts and refuses to replace oversized saves", () => {
    const save = initial(), before = JSON.stringify(save)
    expect(() => prepareSave(save, 100)).toThrow("preserved")
    expect(JSON.stringify(save)).toBe(before)
    expect(saveByteSize(prepareSave(save))).toBeLessThan(SAVE_BUDGET_BYTES)
  })
  it("rejects invalid schema4 statistics, identities, contexts and non-finite values", () => {
    const mutations: ((save: GameSave) => void)[] = [s => { s.stats.totals.population = Infinity }, s => { s.stats.totals.quality.perfect = -1 },
      s => { s.tracking.nextSequence = 0 }, s => { s.tracking.settled = [[1, 100]] }, s => { s.settings.locale = "bad" as "vi" },
      s => { s.inventory.owned = [] }, s => { s.daily.creditedDates = ["invalid"] }, s => { s.stats.totals.scoredBody = 100 }]
    for (const mutate of mutations) { const save = initial(); mutate(save); expect(() => migrateSave(save)).toThrow("preserved") }
    expect(() => migrateSave({ schema: 999 })).toThrow("preserved")
    const game = fixtureGame(), q = allocateRun(initial(), 1000)
    const wrong = makeSummary(game, q.context, 2000); wrong.identity = { ...wrong.identity, installationId: "foreign" }
    expect(() => settleRun(q.save, wrong, golden as RunRecord)).toThrow()
  })
})
