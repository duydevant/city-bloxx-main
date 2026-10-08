import { afterEach, describe, expect, it, vi } from "vitest"
import { emptySave, type GameSave, type SavePort } from "../../../packages/city-bloxx-core/src/index"
import { createSaveController } from "../../../packages/city-bloxx-renderer/src/save-controller"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
afterEach(() => vi.useRealTimers())
describe("C4.0 save adapter transactions", () => {
  it("preserves corrupted/unknown raw data and only permits writes after a successful retry", async () => {
    for (const broken of ["{not-json", JSON.stringify({ schema: 999 })]) {
      let raw = broken
      const write = vi.fn(async (value: GameSave) => { raw = JSON.stringify(value); return true })
      const controller = createSaveController({ load: async () => JSON.parse(raw), save: write })
      await expect(controller.load()).rejects.toThrow()
      expect(await controller.write(emptySave())).toBe(false)
      expect(raw).toBe(broken); expect(write).not.toHaveBeenCalled()
      raw = JSON.stringify({ ...emptySave(), standardQuickBest: 88 })
      const restored = await controller.load()
      expect(restored.standardQuickBest).toBe(88)
      expect(await controller.write(restored)).toBe(true)
      expect(JSON.parse(raw).standardQuickBest).toBe(88)
    }
  })
  it("keeps writes disabled after timeout even when a late read resolves; retry loads the fresh save", async () => {
    vi.useFakeTimers()
    const oldRead = deferred<GameSave>(), write = vi.fn(async () => true)
    const port: SavePort = { load: vi.fn().mockReturnValueOnce(oldRead.promise).mockResolvedValue({ ...emptySave(), standardQuickBest: 99 }), save: write }
    const controller = createSaveController(port, 50)
    const failure = controller.load().catch(error => error)
    await vi.advanceTimersByTimeAsync(51)
    expect((await failure).message).toContain("timeout")
    oldRead.resolve({ ...emptySave(), standardQuickBest: 11 }); await Promise.resolve()
    expect(await controller.write(emptySave())).toBe(false)
    const recovered = await controller.load()
    expect(recovered.standardQuickBest).toBe(99)
    expect(await controller.write(recovered)).toBe(true)
    expect(write).toHaveBeenCalledTimes(1)
  })
  it("rejects superseded loads rather than replacing a newer recovery result", async () => {
    const first = deferred<GameSave>()
    const controller = createSaveController({ load: vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ ...emptySave(), standardQuickBest: 22 }), save: async () => true })
    const stale = controller.load().catch(error => error)
    expect((await controller.load()).standardQuickBest).toBe(22)
    first.resolve({ ...emptySave(), standardQuickBest: 11 })
    expect((await stale).message).toContain("superseded")
  })
  it("never enables persistence when a disposed session finishes loading", async () => {
    const reading = deferred<GameSave>(), write = vi.fn(async () => true)
    const controller = createSaveController({ load: async () => reading.promise, save: write })
    const load = controller.load().catch(error => error)
    controller.dispose(); reading.resolve(emptySave())
    expect((await load).message).toContain("superseded")
    expect(await controller.write(emptySave())).toBe(false); expect(write).not.toHaveBeenCalled()
  })
  it("serializes immutable snapshots and flushes queued writes after disposal", async () => {
    const gate = deferred<boolean>(), written: GameSave[] = []
    const controller = createSaveController({ load: async () => emptySave(), save: async value => { written.push(value); return written.length === 1 ? gate.promise : true } })
    const save = await controller.load()
    const first = controller.write(save)
    save.progression.xp = 7; save.settings.muted = true
    const second = controller.write(save)
    save.progression.xp = 14
    await Promise.resolve()
    expect(written).toHaveLength(1); expect(written[0].progression.xp).toBe(0)
    controller.dispose(); gate.resolve(true)
    expect(await first).toBe(true); expect(await second).toBe(true)
    expect(written[1].progression.xp).toBe(7); expect(written[1].settings.muted).toBe(true)
    expect(await controller.write(save)).toBe(false)
  })
  it("preserves the last good save on quota/write rejection and permits the same snapshot to retry", async () => {
    let raw = JSON.stringify(emptySave()), fail = 1
    const controller = createSaveController({ load: async () => JSON.parse(raw), save: async value => {
      if (fail === 1) throw new Error("QuotaExceededError")
      if (fail === 2) return false
      raw = JSON.stringify(value); return true
    } })
    const save = await controller.load(); save.standardQuickBest = 88
    expect(await controller.write(save)).toBe(false); expect(JSON.parse(raw).standardQuickBest).toBe(0)
    fail = 2; expect(await controller.write(save)).toBe(false); expect(JSON.parse(raw).standardQuickBest).toBe(0)
    fail = 0; expect(await controller.write(save)).toBe(true); expect(JSON.parse(raw).standardQuickBest).toBe(88)
  })
})
