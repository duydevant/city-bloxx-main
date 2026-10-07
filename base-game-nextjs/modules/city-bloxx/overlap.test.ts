import { describe, expect, it } from "vitest"
import { checkpointTower, QuickTowerGame, QUICK_TOWER_RULES as R, restoreTower, type RunConfig } from "../../../packages/city-bloxx-core/src/index"
import { foundation } from "./test-foundation"

describe("40 percent displacement misses",()=>{
  const modes: RunConfig[]=[{seed:119,mode:"quick",assist:false},{seed:119,mode:"quick",assist:true},{seed:119,mode:"city",assist:false,building:"residential"}]
  for(const config of modes)for(const sign of [-1,1])for(const [offset,miss] of [[57.599,false],[57.6,true],[57.601,true]] as const) {
    it(`${config.mode}/${config.assist} offset ${sign*offset}`,()=>{
      const game=new QuickTowerGame(config)
      foundation(game)
      const state=game as unknown as {currentX:number;currentY:number;phase:string;fallSpeed:number}
      state.currentX=game.getSnapshot().floors[0].x+sign*offset;state.currentY=R.groundY-2*R.floorHeight;state.phase="falling";state.fallSpeed=0
      game.advanceTicks(1)
      expect(game.getSnapshot().lastPlacement==="miss").toBe(miss)
      expect(game.getSnapshot().lives).toBe(miss?2:3)
      expect(game.getSnapshot().floors.length).toBe(miss?1:2)
    })
  }
  it("resumes v0.8 City under its original overlap rule and preserves a wide landing",()=>{
    const old=new QuickTowerGame({seed:42,mode:"city",assist:false,building:"residential",legacyOverlap:true,legacyScoring:true})
    for(let tick=0;tick<192&&Math.abs(old.getSnapshot().current.x-75)>3;tick++)old.advanceTicks(1)
    old.drop();old.advanceTicks(5)
    const checkpoint=checkpointTower(old);checkpoint.version="physics-0.8.0";delete checkpoint.config.legacyOverlap
    const restored=restoreTower(checkpoint)
    expect(restored.config.legacyOverlap).toBe(true)
    while(restored.getPhase()==="falling")restored.advanceTicks(1)
    expect(restored.getSnapshot().floors).toHaveLength(1)
    expect(restoreTower(checkpointTower(restored)).getSnapshot()).toEqual(restored.getSnapshot())
  })
})
