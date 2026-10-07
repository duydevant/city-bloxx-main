import { describe, expect, it } from "vitest"
import { QuickTowerGame, QUICK_TOWER_RULES as R, checkpointTower, restoreTower } from "../../../packages/city-bloxx-core/src/index"
import { foundation } from "./test-foundation"

describe("foundation and approved displacement bands",()=>{
  for(const assist of [false,true]) {
    for(const [offset,quality] of [[0,"perfect"],[.001,"perfect"],[7.2,"perfect"],[7.201,"great"],[-7.2,"perfect"],[-7.201,"great"],[21.6,"great"],[21.601,"good"],[43.2,"good"],[43.201,"risky"],[57.599,"risky"],[57.6,"miss"],[64.8,"miss"]] as const) {
      it(`${assist?"Assist":"Standard"}: ${offset} units => ${quality}`,()=>{
        const game=new QuickTowerGame({seed:119,mode:"quick",assist});foundation(game)
        const state=game as unknown as {currentX:number;currentY:number;phase:string;fallSpeed:number}
        state.currentX=offset;state.currentY=R.groundY-2*R.floorHeight;state.phase="falling";state.fallSpeed=0
        game.advanceTicks(1)
        expect(game.getSnapshot().lastPlacement).toBe(quality)
        expect(game.getSnapshot().perfectCount).toBe(quality==="perfect"?1:0)
      })
    }
    it(`foundation is unscored anywhere (${assist})`,()=>{
      const game=new QuickTowerGame({seed:42,mode:"quick",assist});const x=game.getSnapshot().current.x
      foundation(game);const s=game.getSnapshot()
      expect(s.floors[0].x).toBe(x);expect(s.lives).toBe(3);expect(s.lastPlacement).toBeNull()
      expect(s.perfectCount).toBe(0);expect(s.streak).toBe(0);expect(s.comboLevel).toBe(0)
      expect(s.population).toBe(10);expect(game.getResult().accuracy).toBe(0)
    })
  }
  for(const version of ["physics-0.7.0","physics-0.8.0","physics-0.9.0"])it(`preserves ${version} City checkpoint's scored foundation`,()=>{
    const old=new QuickTowerGame({seed:119,mode:"city",assist:false,building:"residential",legacyScoring:true,
      ...(version==="physics-0.7.0"?{legacyPerfect:true,legacyOverlap:true}:version==="physics-0.8.0"?{legacyOverlap:true}:{})})
    old.advanceTicks(1);old.drop(.001);old.advanceTicks(5)
    const c=checkpointTower(old);delete c.config.legacyScoring;c.version=version
    const restored=restoreTower(c);expect(restored.config.legacyScoring).toBe(true)
    while(restored.getPhase()==="falling")restored.advanceTicks(1)
    expect(restored.getSnapshot().lastPlacement).toBe(version==="physics-0.7.0"?"great":"perfect")
    expect(restoreTower(checkpointTower(restored)).getSnapshot()).toEqual(restored.getSnapshot())
  })
})
