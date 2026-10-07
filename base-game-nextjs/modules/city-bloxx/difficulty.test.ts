import { describe, expect, it } from "vitest"
import { floorSway, getQuickDifficulty, QuickTowerGame, QUICK_TOWER_RULES as R, restoreTower, checkpointTower } from "../../../packages/city-bloxx-core/src/index"
import pendingV10 from "../../../packages/city-bloxx-core/fixtures/city-pending-v10.json"

function advanceUntil(g: QuickTowerGame, check: () => boolean) {
  for(let tick=0;tick<3000;tick++) { if(check()) return; g.advanceTicks(1) }
  throw new Error("Difficulty test tick limit")
}
function build(height: number) {
  const g=new QuickTowerGame(42)
  for(let i=0;i<height;i++) {
    advanceUntil(g,()=>{
      const s=g.getSnapshot(), index=s.floors.length-1
      const top=index>=0?s.floors[index].x+floorSway(s,index):0
      return s.phase==="swing" && Math.abs(s.current.x-top)<4
    })
    g.drop();advanceUntil(g,()=>g.getPhase()==="settling")
  }
  advanceUntil(g,()=>g.getPhase()==="swing");g.advanceTicks(180)
  return g
}
function sample(g: QuickTowerGame) {
  let crossings=0, peak=0, previous=g.getSnapshot().current.x-g.getSnapshot().crane.x
  for(let i=0;i<600;i++) {
    g.advanceTicks(1);const s=g.getSnapshot(), x=s.current.x-s.crane.x
    if((previous<0&&x>=0)||(previous>0&&x<=0))crossings++
    previous=x;peak=Math.max(peak,Math.abs(x))
    expect(Number.isFinite(s.current.y)).toBe(true)
  }
  return {crossings,peak}
}
describe("height difficulty ramp",()=>{
  it("increases cadence gradually while shortening the cable and horizontal arc",()=>{
    const low=sample(new QuickTowerGame(42)), highGame=build(20), high=sample(highGame)
    expect(highGame.getSnapshot().floors.length).toBe(20)
    expect(high.crossings).toBeGreaterThan(low.crossings)
    expect(high.peak).toBeLessThan(low.peak)
    expect(highGame.getSnapshot().sway).toBeGreaterThanOrEqual(getQuickDifficulty(20).baselineSway)
  })
  it("keeps the first two floors gentle and caps endless difficulty",()=>{
    expect(getQuickDifficulty(0)).toEqual(getQuickDifficulty(2))
    expect(getQuickDifficulty(10).speedMultiplier).toBeLessThan(getQuickDifficulty(20).speedMultiplier)
    expect(getQuickDifficulty(60)).toEqual(getQuickDifficulty(10000))
    expect(getQuickDifficulty(30).amplitude).toBeLessThan(R.pendulumLength)
    expect(getQuickDifficulty(30).baselineSway).toBeGreaterThan(0)
  })
  it("keeps ten floors gentle, progresses to sixty, and never stretches past the cable",()=>{
    expect(getQuickDifficulty(10).speedMultiplier/getQuickDifficulty(0).speedMultiplier).toBeLessThan(1.06)
    expect(getQuickDifficulty(50).speedMultiplier).toBeLessThan(getQuickDifficulty(10,false,true).speedMultiplier)
    for(let floor=0;floor<=100;floor++) {
      const current=getQuickDifficulty(floor),next=getQuickDifficulty(floor+1)
      expect(current.cableLength).toBeLessThanOrEqual(R.pendulumLength)
      expect(current.amplitude).toBeLessThan(current.cableLength)
      expect(next.cableLength).toBeLessThanOrEqual(current.cableLength)
      expect(next.speedMultiplier).toBeGreaterThanOrEqual(current.speedMultiplier)
      expect(next.speedMultiplier-current.speedMultiplier).toBeLessThanOrEqual(.01001)
    }
  })
  it("restores the recorded v0.10 City fall exactly and retains old motion on the next save",()=>{
    const game=restoreTower(pendingV10.checkpoint),snapshot=game.getSnapshot()
    expect(game.config.legacyMotion).toBe(true)
    for(const field of ["current","floors","camera","lives","population","phase","tick"] as const)expect(snapshot[field]).toEqual(pendingV10.snapshot[field])
    expect(restoreTower(checkpointTower(game)).getSnapshot()).toEqual(snapshot)
  })
  it("keeps Assist progression gentler without altering hitbox or release pose",()=>{
    for(const height of [0,10,20,40]) {
      const standard=getQuickDifficulty(height),assist=getQuickDifficulty(height,true)
      expect(assist.speedMultiplier).toBeLessThan(standard.speedMultiplier)
      expect(assist.amplitude).toBeLessThanOrEqual(standard.amplitude)
      expect(assist.baselineSway).toBeLessThanOrEqual(standard.baselineSway)
    }
  })
})
