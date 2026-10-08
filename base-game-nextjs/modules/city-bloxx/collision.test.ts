import { describe, expect, it } from "vitest"
import { checkpointTower, QuickTowerGame, QUICK_TOWER_RULES as R, restoreTower, sweepTower } from "../../../packages/city-bloxx-core/src/index"
import { foundation } from "./test-foundation"

describe("Miss collision path",()=>{
  it("hits the top facade before passing through it, on either side",()=>{
    for(const sign of [-1,1]) {
      const hit=sweepTower({x:sign*80,y:820},{x:sign*80,y:870},[{x:0}],0,0)
      expect(hit?.floorIndex).toBe(0);expect(hit?.normalY).toBe(-1)
      expect(hit?.y).toBe(970)
    }
  })
  it("skips a non-overlapping top floor and hits the first lower floor in the vertical path",()=>{
    const floors=[{x:100},{x:50},{x:0}]
    const hit=sweepTower({x:160,y:590},{x:160,y:900},floors,0,0)
    expect(hit?.floorIndex).toBe(1)
    expect(hit?.y).toBe(850)
    expect(hit?.normalY).toBe(-1)
  })
  it("does not collide vertically at or beyond exactly 100% displacement",()=>{
    for(const sign of [-1,1])for(const offset of [144,145,300]) {
      expect(sweepTower({x:sign*offset,y:820},{x:sign*offset,y:900},[{x:0}],0,0)).toBeNull()
    }
  })
  it("catches side contacts and sway sweeping into the falling load",()=>{
    const side=sweepTower({x:160,y:900},{x:130,y:925},[{x:0}],0,0)
    expect(side?.normalX).toBe(1);expect(side?.normalY).toBe(0)
    const sway=sweepTower({x:150,y:770},{x:150,y:780},[{x:0},{x:0}],0,70)
    expect(sway?.floorIndex).toBe(1);expect(sway?.normalX).toBe(1)
  })
  it("bounces a Miss, slides out, loses one life, and never adds a floor",()=>{
    for(const sign of [-1,1]) {
      const game=new QuickTowerGame(42);foundation(game)
      const state=game as unknown as {currentX:number;currentY:number;phase:string;fallSpeed:number}
      state.currentX=game.getSnapshot().floors[0].x+sign*80
      state.currentY=R.groundY-2*R.floorHeight-2;state.phase="falling";state.fallSpeed=12
      game.advanceTicks(1)
      const impact=game.getSnapshot()
      expect(impact.phase).toBe("miss");expect(impact.impact?.floorIndex).toBe(0)
      expect(impact.current.y).toBe(R.groundY-2*R.floorHeight)
      game.advanceTicks(1)
      expect(game.getSnapshot().current.y).toBeLessThan(impact.current.y)
      expect(sign*(game.getSnapshot().current.x-impact.current.x)).toBeGreaterThan(0)
      game.setPaused(true);const frozen=game.getSnapshot();game.advanceTicks(100)
      expect(game.getSnapshot()).toEqual(frozen);game.setPaused(false)
      for(let tick=0;tick<250&&game.getPhase()==="miss";tick++)game.advanceTicks(1)
      expect(game.getPhase()).toBe("preparing")
      expect(game.getSnapshot().lives).toBe(2);expect(game.getSnapshot().floors).toHaveLength(1)
      expect(game.getResult().misses).toBe(1)
    }
  })
  it("keeps a fully off-tower Miss falling vertically until a real contact",()=>{
    const game=new QuickTowerGame(42);foundation(game)
    const state=game as unknown as {currentX:number;currentY:number;phase:string;fallSpeed:number}
    state.currentX=game.getSnapshot().floors[0].x+170
    state.currentY=R.groundY-2*R.floorHeight-2;state.phase="falling";state.fallSpeed=12
    game.advanceTicks(1);const miss=game.getSnapshot()
    expect(miss.impact).toBeNull();game.advanceTicks(2)
    expect(game.getSnapshot().current.x).toBe(miss.current.x)
    expect(game.getSnapshot().current.y).toBeGreaterThan(miss.current.y)
  })
  it("resolves a bypassed top floor against a lower facade in the actual simulation",()=>{
    const game=new QuickTowerGame(42)
    const state=game as unknown as {floors:{x:number;quality:"good";population:number;error:number}[];currentX:number;currentY:number;phase:string;fallSpeed:number}
    state.floors.push(...[100,50,0].map(x=>({x,quality:"good" as const,population:10,error:0})))
    state.currentX=160;state.currentY=590;state.phase="falling";state.fallSpeed=30
    game.advanceTicks(1)
    expect(game.getSnapshot().lastPlacement).toBe("miss")
    expect(game.getSnapshot().impact).toBeNull()
    for(let tick=0;tick<10&&!game.getSnapshot().impact;tick++)game.advanceTicks(1)
    expect(game.getSnapshot().impact?.floorIndex).toBe(1)
    expect(game.getSnapshot().lives).toBe(2)
    expect(game.getSnapshot().floors).toHaveLength(3)
    expect(game.getSnapshot().population).toBe(0)
  })
  it("re-simulates a real recorded City impact exactly after reload",()=>{
    const game=new QuickTowerGame({seed:42,mode:"city",building:"residential",assist:false})
    foundation(game)
    for(let tick=0;tick<1000;tick++) {
      const s=game.getSnapshot()
      if(s.phase==="swing"&&Math.abs(s.current.x-s.floors[0].x)>100) {game.drop(1);break}
      game.advanceTicks(1)
    }
    for(let tick=0;tick<200&&!game.getSnapshot().impact;tick++)game.advanceTicks(1)
    expect(game.getSnapshot().impact?.floorIndex).toBe(0)
    const resumed=restoreTower(checkpointTower(game))
    expect(resumed.getSnapshot()).toEqual(game.getSnapshot())
    for(let tick=0;tick<180;tick++) {
      game.advanceTicks(1);resumed.advanceTicks(1)
      expect(resumed.getSnapshot()).toEqual(game.getSnapshot())
    }
  })
})
