import { describe, expect, it } from "vitest"
import { floorSway, getQuickDifficulty, QUICK_TOWER_RULES as R, QuickTowerGame, QuickTowerReplay, verifyRecord } from "../../../packages/city-bloxx-core/src/index"
import { EMPTY_CABLE_LENGTH, loadPose, project, rigGeometry, roofPoint } from "../../../packages/city-bloxx-renderer/src/geometry"

function until(g: QuickTowerGame, check: () => boolean) {
  for(let i=0;i<3000;i++) { if(check()) return; g.advanceTicks(1) }
  throw new Error("Motion test tick limit")
}
describe("drop/landing visual regressions", () => {
  it("keeps Reduced Motion position smooth and aligned with the visible release fraction",()=>{
    const g=new QuickTowerGame(42);g.advanceTicks(54)
    const snapshot=g.getSnapshot(),previous=g.getPreviousRenderSnapshot(snapshot)
    const ordinary=loadPose(snapshot,previous,.37),reduced=loadPose(snapshot,previous,.37,true)
    expect(reduced.x).toBe(ordinary.x);expect(reduced.y).toBe(ordinary.y);expect(reduced.rotation).toBe(0)
    g.drop(.37);expect(g.getSnapshot().current.x).toBeCloseTo(reduced.x,2)
    expect(g.getSnapshot().current.y).toBeCloseTo(reduced.y,2)
  })
  it("keeps the maximum loaded cable and retracts the empty hook close to the pulley", () => {
    expect(getQuickDifficulty(0).cableLength).toBeCloseTo(383 * .6 * .9, 5)
    expect(EMPTY_CABLE_LENGTH).toBe(18)
  })
  it("holds the unloaded hook eye eighteen units below the pulley throughout the swing", () => {
    const g=new QuickTowerGame(42)
    for(let i=0;i<200;i++) {
      g.advanceTicks(1)
      const s=g.getSnapshot(),attached=rigGeometry(s,loadPose(s))
      const unloadedState={...s,phase:"settling" as const,tick:s.tick+30,released:{...s.current},drops:[{tick:s.tick,sequence:0,fraction:1000}]}
      const empty=rigGeometry(unloadedState,loadPose(unloadedState))
      const loadedLength=Math.hypot(attached.eye.x-attached.pivot.x,attached.eye.y-attached.pivot.y)
      const emptyLength=Math.hypot(empty.eye.x-empty.pivot.x,empty.eye.y-empty.pivot.y)
      expect(emptyLength).toBeCloseTo(EMPTY_CABLE_LENGTH,5)
      // Physics follows the load reference point; art adds a 1.5-unit hook-eye offset
      // and at most half-floor-height * rotation at the roof attachment.
      expect(Math.hypot(s.current.x-s.crane.x,s.current.y-s.crane.y-R.hookToRoof)).toBeCloseTo(s.difficulty.cableLength,2)
      expect(Math.abs(loadedLength-s.difficulty.cableLength)).toBeLessThan(1.501+R.floorHeight/2*R.swingRotation)
      expect(empty.eye.x).toBeCloseTo(empty.pivot.x,5)
    }
  })
  it("keeps pickup extension inside the loaded cable length without the old long winch movement", () => {
    const g=new QuickTowerGame(42),base=g.getSnapshot()
    for(let tick=0;tick<=20;tick++) {
      const s={...base,phase:"preparing" as const,loadProgress:tick/20}
      const rig=rigGeometry(s,loadPose(s))
      const length=Math.hypot(rig.eye.x-rig.pivot.x,rig.eye.y-rig.pivot.y)
      expect(length).toBeGreaterThanOrEqual(EMPTY_CABLE_LENGTH-3)
      expect(length).toBeLessThanOrEqual(R.pendulumLength+3)
    }
  })
  it("releases at the exact interpolated pose visible when clicked", () => {
    const g=new QuickTowerGame(42); g.advanceTicks(54)
    const visible=loadPose(g.getSnapshot(),g.getPreviousRenderSnapshot(),.37)
    expect(g.drop(.37)).toBe(true)
    const release=g.getSnapshot().current
    expect(release.x).toBeCloseTo(visible.x,2)
    expect(release.y).toBeCloseTo(visible.y,2)
    g.advanceTicks(5)
    expect(g.getSnapshot().current.x).toBe(release.x)
    expect(g.getSnapshot().current.y).toBeGreaterThan(release.y)
    expect(g.getSnapshot().floors).toHaveLength(0)
  })
  it("keeps an off-center first floor at its release position and pauses before the next load", () => {
    const g=new QuickTowerGame(42)
    until(g,()=>Math.abs(g.getSnapshot().current.x-40)<5)
    g.drop(.5)
    const release=g.getSnapshot(), releasedX=release.current.x
    const screenX=project(release.current,release,390,650).x
    until(g,()=>g.getPhase()==="settling")
    const land=g.getSnapshot()
    expect(land.floors[0].x).toBe(releasedX)
    expect(land.camera.x).toBe(0)
    expect(floorSway(land,0)).toBeCloseTo(0,5)
    expect(project({x:land.floors[0].x,y:R.groundY-R.floorHeight},land,390,650).x).toBe(screenX)
    expect(land.current.y+R.floorHeight).toBe(R.groundY)
    expect(g.drop()).toBe(false)
    g.advanceTicks(R.landingHoldTicks-1)
    expect(g.getPhase()).toBe("settling")
    g.advanceTicks(1)
    expect(g.getPhase()).toBe("preparing")
    expect(g.getSnapshot().loadProgress).toBe(0)
    expect(g.drop()).toBe(false)
    g.advanceTicks(R.prepareTicks)
    expect(g.getPhase()).toBe("swing")
    expect(g.getSnapshot().floors[0].x).toBe(releasedX)
  })
  it("lands new floors without snapping their rendered sway position", () => {
    const g=new QuickTowerGame(42)
    for(let i=0;i<8;i++) {
      until(g,()=>{
        const s=g.getSnapshot(),x=s.floors.length?s.floors[s.floors.length-1].x+floorSway(s,s.floors.length-1):0
        return s.phase==="swing"&&Math.abs(s.current.x-x-25)<5
      })
      g.drop(.6); const releaseX=g.getSnapshot().current.x
      until(g,()=>g.getPhase()==="settling")
      const s=g.getSnapshot(),index=s.floors.length-1
      expect(s.floors[index].x+floorSway(s,index)).toBeCloseTo(releaseX,2)
    }
  })
  it("joins the cable to the hook eye and the hook to the roof lifting straps", () => {
    const g=new QuickTowerGame(42); g.advanceTicks(64)
    const s=g.getSnapshot(),pose=loadPose(s),rig=rigGeometry(s,pose),roof=roofPoint(pose,0)
    expect(rig.attached).toBe(true)
    expect(rig.hookTip.x).toBeCloseTo(roof.x)
    expect(rig.hookTip.y).toBeCloseTo(roof.y-28)
    expect(rig.eye.y).toBeCloseTo(rig.hookTip.y-55)
    expect(rig.slingLeft).toEqual(roofPoint(pose,-R.floorWidth*.36))
    expect(rig.slingRight).toEqual(roofPoint(pose,R.floorWidth*.36))
    g.drop(); g.advanceTicks(5)
    const fall=g.getSnapshot(),releasedRig=rigGeometry(fall,loadPose(fall))
    expect(releasedRig.attached).toBe(false)
    expect(releasedRig.hookTip.y).toBeLessThan(fall.current.y)
    expect(fall.floors.length).toBe(0)
  })
  it("records release fractions and reproduces them in replay", () => {
    const g=new QuickTowerGame(7)
    for(let attempt=0;g.getPhase()!=="ended"&&attempt<30;attempt++) {
      until(g,()=>{const s=g.getSnapshot(),top=s.floors.at(-1)?.x??0;return s.phase==="swing"&&Math.abs(s.current.x-top)>115})
      g.drop(.333);until(g,()=>g.getPhase()==="swing"||g.getPhase()==="ended")
    }
    const record=g.getRecord(); expect(record.inputs.every(d=>d.fraction===333)).toBe(true)
    const replay=new QuickTowerReplay(record);replay.advanceTicks(record.endTick)
    expect(replay.getResult()).toEqual(record.result)
    expect(verifyRecord(record)).toEqual(record)
  })
})
