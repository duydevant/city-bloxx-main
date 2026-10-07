import { describe, expect, it } from "vitest"

import { QuickTowerGame } from "../../../packages/city-bloxx-core/src/index"

function advanceUntil(game: QuickTowerGame, predicate: () => boolean, limit = 1200) {
  for (let index = 0; index < limit; index += 1) {
    if (predicate()) return
    game.update(1 / 60)
  }
  throw new Error("Condition was not reached within the tick limit")
}

describe("QuickTowerGame", () => {
  it("lands a centered floor and records one input", () => {
    const game = new QuickTowerGame(42)
    advanceUntil(game, () => Math.abs(game.getSnapshot().current.x) < 3)
    expect(game.drop()).toBe(true)
    expect(game.drop()).toBe(false)
    advanceUntil(game, () => game.getSnapshot().floors.length === 1)

    const result = game.getSnapshot()
    expect(result.floors).toHaveLength(1)
    expect(result.population).toBeGreaterThan(0)
    expect(result.drops).toHaveLength(1)
    expect(result.lives).toBe(3)
  })

  it("is deterministic for the same seed and inputs", () => {
    const first = new QuickTowerGame(9921)
    const second = new QuickTowerGame(9921)
    for (let tick = 0; tick < 400; tick += 1) {
      if (tick === 25 || tick === 210) {
        first.drop()
        second.drop()
      }
      first.update(1 / 60)
      second.update(1 / 60)
    }
    expect(second.getSnapshot()).toEqual(first.getSnapshot())
  })

  it("does not spend a life or judge the foundation at an extreme offset", () => {
    const game = new QuickTowerGame(7)
    advanceUntil(game, () => Math.abs(game.getSnapshot().current.x) > 150)
    game.drop()
    advanceUntil(game, () => game.getSnapshot().floors.length===1)
    expect(game.getSnapshot().lives).toBe(3)
    expect(game.getSnapshot().lastPlacement).toBeNull()
  })
})
