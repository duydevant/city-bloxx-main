import { describe, expect, it } from "vitest"
import { cameraLift, commitRun, emptySave, floorSway, migrateSave, QuickTowerGame, QuickTowerReplay, QUICK_TOWER_RULES as R, verifyRecord, type RunRecord } from "../../../packages/city-bloxx-core/src/index"
import golden from "../../../packages/city-bloxx-core/fixtures/quick-mixed-v13.json"
import { placeAccurately } from "./test-simulation"

function until(game: QuickTowerGame, predicate: () => boolean, limit = 3000) {
  for (let i=0; i<limit; i++) { if (predicate()) return; game.advanceTicks(1) }
  throw new Error("Tick limit")
}
function place(game: QuickTowerGame, offset = 0) {
  until(game, () => {
    const s = game.getSnapshot()
    const center = s.floors.length ? s.floors[s.floors.length - 1].x + floorSway(s,s.floors.length-1) : 0
    return s.phase === "swing" && Math.abs(s.current.x - center - offset) < (offset===0?1:5)
  })
  const count = game.getSnapshot().feedbackId
  expect(game.drop(0)).toBe(true)
  until(game, () => game.getSnapshot().feedbackId > count)
}
function miss(game: QuickTowerGame) {
  until(game, () => {
    const s=game.getSnapshot(), center=s.floors.length ? s.floors[s.floors.length-1].x + floorSway(s,s.floors.length-1) : 0
    return s.phase === "swing" && Math.abs(s.current.x - center) > 115
  })
  game.drop(0)
  until(game, () => game.getSnapshot().phase === "swing" || game.getSnapshot().phase === "ended")
}
export function fixtureRun(assist = false): RunRecord {
  const game = new QuickTowerGame({seed:42,mode:"quick",assist})
  place(game); place(game)
  game.advanceTicks(220) // combo expires before next placement
  for(let i=0;i<6;i++) place(game, 30)
  for(let i=0;i<30 && game.getPhase()!=="ended";i++) miss(game)
  return game.getRecord()
}
describe("C0–C2 acceptance", () => {
  it("matches the checked-in golden fixture exactly", () => {
    expect(fixtureRun()).toEqual(golden)
    expect(verifyRecord(golden)).toEqual(golden)
  })
  it("stacks 50 floors with spawn above tower, a shorter cable, and correct camera", () => {
    const game = new QuickTowerGame(42)
    for(let i=0;i<50;i++) placeAccurately(game)
    until(game, () => game.getSnapshot().phase === "swing")
    const s=game.getSnapshot()
    expect(s.floors.length).toBe(50)
    expect(s.difficulty.cableLength).toBeCloseTo(R.pendulumLength*.48*.9,4)
    expect(s.current.y + cameraLift(s)).toBeLessThanOrEqual(R.spawnY + 1)
    expect(s.current.y + R.floorHeight).toBeLessThan(R.groundY - s.floors.length*R.floorHeight)
    expect(s.lives).toBe(3)
  })
  it("pauses during fall without advancing clock or accepting input", () => {
    const g=new QuickTowerGame(1); g.drop(); g.advanceTicks(12)
    const before=g.getSnapshot(); g.setPaused(true); g.update(10); g.advanceTicks(1000)
    expect(g.drop()).toBe(false); expect(g.getSnapshot()).toEqual(before)
    g.setPaused(false); g.advanceTicks(1); expect(g.getSnapshot().tick).toBe(before.tick+1)
  })
  it("replays misses, expired combo and high sway at 30/60/120 FPS", () => {
    const record=fixtureRun()
    expect(record.result.misses).toBe(3)
    for(const fps of [30,60,120]) {
      const replay=new QuickTowerReplay(record)
      for(let i=0; i<(record.endTick/60+1)*fps; i++) replay.update(1/fps)
      expect(replay.getResult()).toEqual(record.result)
      expect(replay.getSnapshot().phase).toBe("ended")
    }
    expect(verifyRecord(record)).toEqual(record)
  })
  it("freezes, restarts and completes replay without changing its record", () => {
    const record=fixtureRun(), replay=new QuickTowerReplay(record)
    replay.advanceTicks(50); const before=replay.getSnapshot(); replay.setPaused(true); replay.advanceTicks(500)
    expect(replay.getSnapshot()).toEqual(before)
    replay.restart(); expect(replay.getSnapshot().tick).toBe(0)
    replay.advanceTicks(record.endTick); expect(replay.getResult()).toEqual(record.result)
  })
  it("keeps Assist scores separate and preserves previous results on retry", () => {
    const record=fixtureRun(true), copy=JSON.stringify(record)
    const save=commitRun(emptySave(),record)
    expect(save.standardQuickBest).toBe(0); expect(save.assistQuickBest).toBeGreaterThan(0)
    expect(record.result.ranked).toBe(false)
    new QuickTowerGame(21).advanceTicks(200)
    expect(JSON.stringify(record)).toBe(copy)
    expect(save.lastReplay).toEqual(record)
  })
  it("migrates legacy PB, validates ranges and preserves unsupported saves", () => {
    expect(migrateSave({schema:1,standardQuickBest:88}).standardQuickBest).toBe(88)
    expect(migrateSave({schema:2,standardQuickBest:-100,assistQuickBest:Infinity}).standardQuickBest).toBe(0)
    expect(() => migrateSave({schema:99})).toThrow("preserved")
    expect(() => migrateSave(null)).toThrow("preserved")
  })
  it("rejects corrupted results, versions and input order", () => {
    const r=fixtureRun()
    expect(() => verifyRecord({...r,result:{...r.result,population:999}})).toThrow("mismatch")
    expect(() => verifyRecord({...r,physicsVersion:"old"})).toThrow()
    expect(() => verifyRecord({...r,inputs:[...r.inputs].reverse()})).toThrow()
  })
  it("uses the identical top sway offset for rendering and collision", () => {
    const game=new QuickTowerGame(42)
    for(let i=0;i<7;i++) place(game,30)
    const s=game.getSnapshot()
    expect(s.sway).toBeGreaterThan(0)
    expect(Math.abs(s.swayOffset)).toBeGreaterThan(0)
    expect(floorSway(s,s.floors.length-1)).toBe(s.swayOffset)
  })
  it("bounds the archive while retaining the latest and Standard PB replay across 30 completed runs", () => {
    const record=fixtureRun(); let save=emptySave()
    for(let i=0;i<30;i++) save=commitRun(save,record)
    expect(save.runs).toBe(30)
    expect(save.history).toHaveLength(30)
    expect(save.replays.length).toBeLessThanOrEqual(3)
    expect(JSON.stringify(save).length*2).toBeLessThan(256*1024)
    expect(save.lastReplay).toEqual(record)
  })
})
