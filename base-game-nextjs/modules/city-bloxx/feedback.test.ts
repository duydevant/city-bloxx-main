import { expect, it } from "vitest"
import { placementLabel } from "../../../packages/city-bloxx-renderer/src/feedback"
import { BUILDING_IDS, emptyCity, placementStatus } from "../../../packages/city-bloxx-core/src/index"

it("labels consecutive Perfects and does not count a roof as another body Perfect", () => {
  expect(placementLabel("perfect", 1)).toBe("PERFECT")
  expect(placementLabel("perfect", 2)).toBe("DOUBLE PERFECT")
  expect(placementLabel("perfect", 3)).toBe("TRIPLE PERFECT")
  expect(placementLabel("perfect", 10)).toBe("PERFECT ×10")
  expect(placementLabel("great", 0)).toBe("GREAT")
  expect(placementLabel("miss", 0)).toBe("MISS")
  expect(placementLabel("perfect", 10, true)).toBe("PERFECT ROOF")
})

it("explains why side-by-side Residential/Industrial cannot support an empty Office lot", () => {
  const city = emptyCity(); city.unlocked = [...BUILDING_IDS]
  const building = { runId: "city-1", skin: "default" as const, floors: 10, population: 100, roof: true, complete: true, accuracy: 100, rating: "S" as const }
  city.lots[12] = { ...building, classId: "residential" } // (3,3), one-based
  city.lots[13] = { ...building, classId: "industrial" } // (3,4)
  expect(city.lots.some((lot, index) => !lot && placementStatus(city, index, "office").valid)).toBe(false)
  city.lots[7] = { ...building, classId: "residential" } // (2,3)
  expect(placementStatus(city, 8, "office").valid).toBe(true) // (2,4)
})
