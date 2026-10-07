import { expect, it } from "vitest"
import { POPULATION_SPRITES, parachutePose, POPULATION_DURATION } from "../../../packages/city-bloxx-renderer/src/population"
import { placementLabel } from "../../../packages/city-bloxx-renderer/src/feedback"
import { cityGuide } from "../../../packages/city-bloxx-renderer/src/city-guide"

it("uses approved representative counts, zero misses and bounded animations",()=>{
  expect(Object.values(POPULATION_SPRITES).map(q=>q.perfect)).toEqual([4,6,8,10])
  for(const quality of Object.values(POPULATION_SPRITES)) {
    expect(quality.perfect).toBeGreaterThan(quality.great);expect(quality.great).toBeGreaterThan(quality.good)
    expect(quality.good).toBeGreaterThan(quality.risky);expect(quality.miss).toBe(0)
  }
  for(let i=0;i<10;i++) {
    expect(parachutePose(i,10,POPULATION_DURATION).progress).toBe(1)
    expect(parachutePose(i,10,POPULATION_DURATION).alpha).toBe(0)
  }
})
it("localizes quality labels and complete City guide",()=>{
  expect(placementLabel("perfect",2,false,true)).toBe("HOÀN HẢO KÉP")
  expect(placementLabel("miss",0,false,true)).toBe("TRƯỢT")
  expect(cityGuide(true).pages).toHaveLength(cityGuide(false).pages.length)
  expect(cityGuide(true).pages.join(" ")).toContain("Tầng móng")
  expect(cityGuide(false).pages.join(" ")).toContain("foundation")
})
