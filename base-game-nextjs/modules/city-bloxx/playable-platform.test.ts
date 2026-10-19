import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { emptySave, migrateSave } from "../../../packages/city-bloxx-core/src/index"
import {
  clearSave,
  getSavedScoreMeta,
  hasLoadedSave,
  loadSave,
  markSaveLoadFailed,
  persistSave,
  saveEncodingBytes,
} from "../../../base-playable-main/src/platform/save"
import {
  disposeScore,
  flushScore,
  getLastSentScore,
  getRetryDelayMs,
  getScoreState,
  onScoreStateChange,
  reconcileSavedScore,
  RETRY_DELAYS_SECONDS,
  retryPendingScore,
  sendScore,
} from "../../../base-playable-main/src/platform/engagement"

interface MockSdkControl {
  inPlayables: boolean
  cloudStore: string | undefined
  loadError: Error | null
  saveError: Error | null
  scoreCalls: number[]
  scoreErrorCount: number
  firstFrameCalls: number
  gameReadyCalls: number
}

let mockCtrl: MockSdkControl

function setupWindowMock() {
  mockCtrl = {
    inPlayables: true,
    cloudStore: undefined,
    loadError: null,
    saveError: null,
    scoreCalls: [],
    scoreErrorCount: 0,
    firstFrameCalls: 0,
    gameReadyCalls: 0,
  }
  const localMap = new Map<string, string>()
  const g = globalThis as unknown as {
    window: Record<string, unknown>
  }
  g.window = {
    setTimeout: (...args: Parameters<typeof setTimeout>) => globalThis.setTimeout(...args),
    clearTimeout: (...args: Parameters<typeof clearTimeout>) => globalThis.clearTimeout(...args),
    localStorage: {
      getItem: (k: string) => localMap.get(k) ?? null,
      setItem: (k: string, v: string) => { localMap.set(k, v) },
      removeItem: (k: string) => { localMap.delete(k) },
    },
    ytgame: {
      IN_PLAYABLES_ENV: () => mockCtrl.inPlayables,
      game: {
        firstFrameReady: () => { mockCtrl.firstFrameCalls += 1 },
        gameReady: () => { mockCtrl.gameReadyCalls += 1 },
        loadData: async () => {
          if (mockCtrl.loadError) throw mockCtrl.loadError
          return mockCtrl.cloudStore
        },
        saveData: async (data: string) => {
          if (mockCtrl.saveError) throw mockCtrl.saveError
          mockCtrl.cloudStore = data
        },
      },
      system: {
        isAudioEnabled: () => true,
        onAudioEnabledChange: () => {},
        onPause: () => {},
        onResume: () => {},
        getLanguage: async () => "en-US",
      },
      engagement: {
        sendScore: async ({ value }: { value: number }) => {
          mockCtrl.scoreCalls.push(value)
          if (mockCtrl.scoreErrorCount > 0) {
            mockCtrl.scoreErrorCount -= 1
            throw new Error("Simulated sendScore network error")
          }
        },
      },
      ads: {
        requestInterstitialAd: async () => {},
        requestRewardedAd: async () => false,
      },
      health: {
        logWarning: async () => {},
        logError: async () => {},
      },
    },
  }
}

beforeEach(() => {
  setupWindowMock()
})

afterEach(() => {
  disposeScore()
  vi.useRealTimers()
})

describe("Y0–Y1 Playable save & score hardening", () => {
  it("blocks writes before loadSave succeeds or after load/migration failure, preserving existing cloud data", async () => {
    markSaveLoadFailed()
    expect(hasLoadedSave()).toBe(false)
    mockCtrl.cloudStore = JSON.stringify({ v: 1, d: { ...emptySave(), standardQuickBest: 320 } })

    expect(await persistSave(emptySave())).toBe(false)
    expect(JSON.parse(mockCtrl.cloudStore).d.standardQuickBest).toBe(320)

    mockCtrl.loadError = new Error("SDK loadData unavailable")
    await expect(loadSave(emptySave())).rejects.toThrow("SDK loadData unavailable")
    expect(hasLoadedSave()).toBe(false)
    expect(await persistSave(emptySave())).toBe(false)
    expect(JSON.parse(mockCtrl.cloudStore).d.standardQuickBest).toBe(320)

    mockCtrl.loadError = null
    const loaded = await loadSave(emptySave())
    expect(hasLoadedSave()).toBe(true)
    expect(loaded.standardQuickBest).toBe(320)
    expect(await persistSave({ ...loaded, standardQuickBest: 410 })).toBe(true)
    expect(JSON.parse(mockCtrl.cloudStore!).d.standardQuickBest).toBe(410)
  })

  it("preserves unknown envelope version or unknown GameSave schema without overwriting", async () => {
    const unknownEnvelope = JSON.stringify({ v: 99, d: emptySave() })
    mockCtrl.cloudStore = unknownEnvelope
    await expect(loadSave(emptySave())).rejects.toThrow("Unsupported save envelope")
    expect(await persistSave(emptySave())).toBe(false)
    expect(mockCtrl.cloudStore).toBe(unknownEnvelope)

    const unknownSchema = JSON.stringify({ v: 1, d: { schema: 999, standardQuickBest: 777 } })
    mockCtrl.cloudStore = unknownSchema
    const rawPayload = await loadSave(emptySave())
    expect(() => {
      try {
        migrateSave(rawPayload)
      } catch (e) {
        markSaveLoadFailed()
        throw e
      }
    }).toThrow("Unknown save schema")
    expect(hasLoadedSave()).toBe(false)
    expect(await persistSave(emptySave())).toBe(false)
    expect(mockCtrl.cloudStore).toBe(unknownSchema)
  })

  it("enforces 256 KiB UTF-8/UTF-16 budget and UTF-16 well-formedness", async () => {
    await clearSave()
    await loadSave(emptySave())

    const oversized = { ...emptySave(), extra: "x".repeat(140_000) }
    expect(saveEncodingBytes(JSON.stringify({ v: 1, d: oversized })).utf16).toBeGreaterThan(256 * 1024)
    expect(await persistSave(oversized)).toBe(false)

    const malformed = { ...emptySave(), bad: "\uD800" }
    expect(await persistSave(malformed)).toBe(false)
  })

  it("computes exact 1/2/4/8/16s exponential backoff capped at 30s", () => {
    expect(RETRY_DELAYS_SECONDS).toEqual([1, 2, 4, 8, 16, 30])
    expect([1, 2, 3, 4, 5, 6, 7].map(a => getRetryDelayMs(a))).toEqual([
      1000,
      2000,
      4000,
      8000,
      16000,
      30000,
      30000,
    ])
  })

  it("persists pending score, retries with 1/2/4/8/16s backoff, cancels on dispose, and only records ack on resolve", async () => {
    vi.useFakeTimers()
    await clearSave()
    const initial = await loadSave(emptySave())
    await persistSave(initial)
    await reconcileSavedScore(0)

    const states: string[] = []
    const off = onScoreStateChange(s => states.push(`${s.status}:${s.pendingScore}:${s.ackedScore}:${s.retryAttempt}`))

    mockCtrl.scoreErrorCount = 3
    await flushScore(250)

    // Attempt 1 failed: ackedScore is still 0, pendingScore is 250, retryAttempt is 1 (1000ms)
    expect(getLastSentScore()).toBe(0)
    expect(getScoreState()).toMatchObject({
      status: "pending",
      pendingScore: 250,
      ackedScore: 0,
      retryAttempt: 1,
      nextRetryDelayMs: 1000,
    })
    expect(getSavedScoreMeta()).toMatchObject({ pendingScore: 250, ackedScore: 0 })

    // Advance 1000ms -> Attempt 2 fails -> retryAttempt 2 (2000ms)
    await vi.advanceTimersByTimeAsync(1000)
    expect(mockCtrl.scoreCalls).toEqual([250, 250])
    expect(getScoreState()).toMatchObject({
      status: "pending",
      pendingScore: 250,
      ackedScore: 0,
      retryAttempt: 2,
      nextRetryDelayMs: 2000,
    })

    // Advance 2000ms -> Attempt 3 fails -> retryAttempt 3 (4000ms)
    await vi.advanceTimersByTimeAsync(2000)
    expect(mockCtrl.scoreCalls).toEqual([250, 250, 250])
    expect(getScoreState()).toMatchObject({
      status: "pending",
      pendingScore: 250,
      ackedScore: 0,
      retryAttempt: 3,
      nextRetryDelayMs: 4000,
    })

    // Advance 4000ms -> Attempt 4 succeeds!
    await vi.advanceTimersByTimeAsync(4000)
    expect(mockCtrl.scoreCalls).toEqual([250, 250, 250, 250])
    expect(getLastSentScore()).toBe(250)
    expect(getScoreState()).toMatchObject({
      status: "synced",
      pendingScore: 250,
      ackedScore: 250,
      retryAttempt: 0,
    })
    expect(getSavedScoreMeta()).toMatchObject({ pendingScore: 250, ackedScore: 250 })

    // Idempotent & monotonic: sending <= 250 does not call SDK again
    await flushScore(250)
    await flushScore(180)
    await sendScore(250)
    expect(mockCtrl.scoreCalls).toHaveLength(4)

    // Dispose cancels pending retry timers
    mockCtrl.scoreErrorCount = 2
    await flushScore(400)
    expect(getScoreState().retryAttempt).toBe(1)
    disposeScore()
    await vi.advanceTimersByTimeAsync(30000)
    expect(mockCtrl.scoreCalls).toEqual([250, 250, 250, 250, 400])

    off()
    expect(states.length).toBeGreaterThan(0)
  })

  it("reconciles saved PB after reload and retries pending score on resume", async () => {
    // Simulate a cloud save from an earlier session where standardQuickBest=512 was saved before score acked
    mockCtrl.cloudStore = JSON.stringify({
      v: 1,
      d: { ...emptySave(), standardQuickBest: 512 },
      score: { pendingScore: 512, ackedScore: 300, ackedAt: 1000 },
    })

    mockCtrl.scoreErrorCount = 1
    const loaded = migrateSave(await loadSave(emptySave()))
    await persistSave(loaded)
    await reconcileSavedScore(loaded.standardQuickBest)

    // First reconcile attempt failed; score remains pending (512 > 300)
    expect(mockCtrl.scoreCalls).toEqual([512])
    expect(getScoreState()).toMatchObject({
      status: "pending",
      pendingScore: 512,
      ackedScore: 300,
      retryAttempt: 1,
    })

    // Simulate host resume -> retryPendingScore() flushes immediately and succeeds
    await retryPendingScore()
    expect(mockCtrl.scoreCalls).toEqual([512, 512])
    expect(getScoreState()).toMatchObject({
      status: "synced",
      pendingScore: 512,
      ackedScore: 512,
      retryAttempt: 0,
    })
    const persisted = JSON.parse(mockCtrl.cloudStore!)
    expect(persisted.v).toBe(1)
    expect(persisted.d.standardQuickBest).toBe(512)
    expect(persisted.score.ackedScore).toBe(512)
  })
})
