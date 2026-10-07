import { describe, expect, it } from "vitest"
import { QuickTowerGame, QuickTowerReplay } from "../../../packages/city-bloxx-core/src/index"
import { cityGuide } from "../../../packages/city-bloxx-renderer/src/city-guide"
import fixture from "../../../packages/city-bloxx-core/fixtures/quick-mixed-v11.json"
import type { RunRecord } from "../../../packages/city-bloxx-core/src/index"

describe("render budget and structured guide",()=>{
  it("reuses the supplied immutable frame arrays instead of cloning a second snapshot",()=>{
    const game=new QuickTowerGame(42);game.advanceTicks(54)
    const frame=game.getSnapshot(),before=JSON.stringify(frame)
    const previous=game.getPreviousRenderSnapshot(frame)
    expect(previous).toEqual(game.getPreviousRenderSnapshot())
    expect(previous.floors).toBe(frame.floors);expect(previous.drops).toBe(frame.drops)
    expect(JSON.stringify(frame)).toBe(before)
  })
  it("shares the same render API and phase accessor for replay",()=>{
    const replay=new QuickTowerReplay(fixture as RunRecord);replay.advanceTicks(100)
    const frame=replay.getSnapshot()
    expect(replay.getPhase()).toBe(frame.phase)
    expect(replay.getPreviousRenderSnapshot(frame)).toEqual(replay.getPreviousRenderSnapshot())
    expect(replay.getPreviousRenderSnapshot(frame).drops).toBe(frame.drops)
  })
  it("keeps both languages in six compact sections with separate quality lines",()=>{
    for(const vi of [false,true]) {
      const guide=cityGuide(vi)
      expect(guide.sections).toHaveLength(6);expect(guide.pages).toHaveLength(6)
      expect(guide.sections[3].items).toHaveLength(5)
      expect(guide.sections[3].items[4]).toContain("≥40%")
      expect(guide.sections.every(section=>section.items.length<=5)).toBe(true)
    }
  })
})
