import { describe, it, expect, vi } from "vitest"
import {
  emptySave,
  beginCityTower,
  beginDaily,
  resolveDaily,
  allocateRun,
  QuickTowerGame,
  checkpointDaily,
  type GameSave,
} from "../../../packages/city-bloxx-core/src/index"
import { CloudCoordinator, type CloudEnvironment } from "./coordinator"
import {
  freshAccount,
  type AccountSave,
  type Backup,
  type Change,
  type CloudSnapshot,
  type CloudStorage,
  type Mutation,
} from "./storage"
import { ApiError } from "../api/api-client"
import { canonical } from "./guest"

class Memory implements CloudStorage {
  records = new Map<string, AccountSave>()
  copies: Backup[] = []
  fail = false
  chain = Promise.resolve()
  async read(owner: string) {
    await this.chain
    return structuredClone(this.records.get(owner) ?? null)
  }
  change(owner: string, work: Change): Promise<AccountSave> {
    const operation = this.chain.then(() => {
      if (this.fail) throw new Error("quota")
      const backups: Backup[] = []
      const result = work(structuredClone(this.records.get(owner) ?? freshAccount(owner)), (raw, source) =>
        backups.push({ id: crypto.randomUUID(), owner, raw, source, createdAt: 1, expiresAt: 1000 }),
      )
      this.records.set(owner, structuredClone(result))
      this.copies.push(...backups)
      return structuredClone(result)
    })
    this.chain = operation.then(
      () => undefined,
      () => undefined,
    )
    return operation
  }
  async backups(owner: string) {
    return this.copies.filter((b) => b.owner === owner)
  }
}
const raw = (runs = 0) => JSON.stringify({ ...emptySave(), runs })
const remote = (revision = "0", payload: unknown = null): CloudSnapshot => ({
  revision,
  payload,
  schema: payload ? (payload as { schema: number }).schema : null,
  hash: payload ? "hash" : null,
  updatedAt: payload ? "2026-10-15T00:00:00Z" : null,
  compatibility: payload
    ? (payload as { schema: number }).schema === 999
      ? "incompatible"
      : "compatible"
    : "absent",
})
function world(storage = new Memory()) {
  const clouds = new Map<string, CloudSnapshot>(),
    receipts = new Map<string, { hash: string; receipt: object }>(),
    calls: { owner: string; path: string; body?: Mutation }[] = []
  let guest = raw(7),
    now = 1000,
    online = true,
    lose = false,
    reject: ApiError | null = null
  const timers: (() => void)[] = []
  const env: CloudEnvironment = {
    storage,
    guest: {
      read: () => guest,
      write: (r) => {
        guest = r
      },
    },
    pause: vi.fn().mockResolvedValue(true),
    now: () => now,
    online: () => online,
    uuid: () => crypto.randomUUID(),
    post: vi.fn(),
    lock: async (_owner, work) => work(),
    schedule: (fn) => {
      timers.push(fn)
      return () => {}
    },
    request: async <T>(owner: string, path: string, options?: RequestInit): Promise<T> => {
      const body: Mutation | undefined = options?.body ? JSON.parse(String(options.body)) : undefined
      calls.push({ owner, path, body })
      if (!online) throw new ApiError("network")
      if (reject) throw reject
      const cloud = clouds.get(owner) ?? remote()
      if (!body) return structuredClone(cloud) as T
      const id = `${owner}:${body.mutationId}`,
        hash = canonical(body),
        prior = receipts.get(id)
      if (prior) {
        if (prior.hash !== hash) throw new ApiError("conflict", 409)
        return structuredClone(prior.receipt) as T
      }
      if (body.expectedRevision !== cloud.revision) throw new ApiError("conflict", 409)
      const payload =
        body.choice === "cloud"
          ? cloud.payload
          : body.choice
            ? JSON.parse(body.local!.rawPayload)
            : body.payload
      const revision = String(BigInt(cloud.revision) + BigInt(1))
      clouds.set(owner, remote(revision, payload))
      const receipt = { revision, mutationId: body.mutationId }
      receipts.set(id, { hash, receipt })
      if (lose) {
        lose = false
        throw new ApiError("network")
      }
      return receipt as T
    },
  }
  const create = () => new CloudCoordinator(env)
  return {
    storage,
    clouds,
    calls,
    timers,
    env,
    create,
    guest: () => guest,
    setGuest: (r: string) => {
      guest = r
    },
    time: (n: number) => {
      now = n
    },
    offline: () => {
      online = false
    },
    online: () => {
      online = true
    },
    lose: () => {
      lose = true
    },
    reject: (e: ApiError | null) => {
      reject = e
    },
  }
}
async function opened(w: ReturnType<typeof world>, owner = "A") {
  const c = w.create()
  await c.identity(owner, true)
  const p = c.attach()
  await p.port.load()
  return { c, p }
}
async function seeded(w: ReturnType<typeof world>, owner = "A") {
  const pair = await opened(w, owner)
  await pair.c.flush()
  return pair
}
describe("W1.4 durable account cloud coordinator", () => {
  it("keeps Guest unchanged, starts a separate account, and imports only explicitly without adding XP", async () => {
    const w = world(),
      { c } = await seeded(w)
    expect(JSON.parse(c.snapshot().raw!).runs).toBe(0)
    expect(w.guest()).toBe(raw(7))
    await c.importGuest()
    expect(JSON.parse(c.snapshot().raw!).runs).toBe(7)
    expect(w.guest()).toBe(raw(7))
    expect(w.storage.copies.map((b) => b.source)).toContain("before-guest-import")
    await c.flush()
    expect((w.clouds.get("A")!.payload as GameSave).runs).toBe(7)
    await c.identity("B", true, true)
    expect(JSON.parse(c.snapshot().raw!).runs).toBe(0)
  })
  it("reports local durability before cloud success and coalesces unsent writes", async () => {
    const w = world(),
      { c, p } = await seeded(w)
    w.calls.length = 0
    expect(await p.port.save({ ...emptySave(), runs: 1 })).toBe(true)
    expect(await p.port.save({ ...emptySave(), runs: 2 })).toBe(true)
    expect(c.snapshot().status).toBe("pending")
    expect(w.calls).toHaveLength(0)
    await c.flush()
    expect(w.calls.filter((x) => x.body)).toHaveLength(1)
    expect((w.clouds.get("A")!.payload as GameSave).runs).toBe(2)
    expect(c.snapshot().status).toBe("saved")
  })
  it("retries the exact durable mutation after a consumed/lost response and reload", async () => {
    const w = world(),
      { c, p } = await seeded(w)
    await p.port.save({ ...emptySave(), runs: 2 })
    w.lose()
    await c.flush()
    const before = structuredClone((await w.storage.read("A"))!.pending)
    expect(before).not.toBeNull()
    c.dispose()
    w.time(10000)
    const reloaded = w.create()
    await reloaded.identity("A", true)
    expect((await w.storage.read("A"))!.pending).toBeNull()
    expect(w.clouds.get("A")!.revision).toBe("2")
    const sent = w.calls.filter((x) => x.body?.mutationId === before!.body.mutationId)
    expect(sent).toHaveLength(2)
    expect(sent[0].body).toEqual(sent[1].body)
  })
  it("preserves newer local work while acknowledging an older in-flight mutation", async () => {
    const w = world(),
      { c, p } = await seeded(w),
      request = w.env.request
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    let sent!: () => void
    const started = new Promise<void>((r) => {
      sent = r
    })
    w.env.request = async (owner, path, options) => {
      if (options?.body) {
        sent()
        await gate
      }
      return request(owner, path, options)
    }
    await p.port.save({ ...emptySave(), runs: 2 })
    const flight = c.flush()
    await started
    await p.port.save({ ...emptySave(), runs: 3 })
    release()
    await flight
    expect(JSON.parse(c.snapshot().raw!).runs).toBe(3)
    expect(c.snapshot().status).toBe("pending")
    await c.flush()
    expect((w.clouds.get("A")!.payload as GameSave).runs).toBe(3)
    expect(w.clouds.get("A")!.revision).toBe("3")
  })
  it("keeps offline work durable through reload and reconnect", async () => {
    const w = world(),
      { c, p } = await seeded(w)
    w.offline()
    expect(await p.port.save({ ...emptySave(), runs: 8 })).toBe(true)
    await c.flush()
    expect(c.snapshot().status).toBe("offline")
    c.dispose()
    const next = w.create()
    await next.identity("A", true)
    expect(next.snapshot().ready).toBe(true)
    expect(JSON.parse(next.snapshot().raw!).runs).toBe(8)
    w.online()
    await next.retry()
    await next.flush()
    expect((w.clouds.get("A")!.payload as GameSave).runs).toBe(8)
  })
  it("retains retry-after across reloads without sending before the deadline", async () => {
    const w = world(),
      { c, p } = await seeded(w)
    await p.port.save({ ...emptySave(), runs: 9 })
    w.reject(new ApiError("rate", 429, 60))
    await c.flush()
    expect(c.snapshot().retryAt).toBe(61000)
    const count = w.calls.filter((c) => c.body).length
    c.dispose()
    const next = w.create()
    await next.identity("A", true)
    await next.retry()
    expect(w.calls.filter((c) => c.body)).toHaveLength(count)
    w.time(62000)
    w.reject(null)
    await next.retry()
    expect(w.clouds.get("A")!.revision).toBe("2")
  })
  it.each(["local", "cloud"] as const)(
    "backs up both conflict candidates before choosing %s and never merges progress",
    async (choice) => {
      const w = world(),
        { c, p } = await seeded(w)
      await p.port.save({ ...emptySave(), runs: 4 })
      w.clouds.set("A", remote("2", JSON.parse(raw(20))))
      await c.flush()
      expect(c.snapshot().status).toBe("conflict")
      expect(c.snapshot().locked).toBe(true)
      const old = p.port
      await c.choose(choice)
      expect(c.snapshot().revision).toBe("3")
      expect(JSON.parse(c.snapshot().raw!).runs).toBe(choice === "local" ? 4 : 20)
      expect(await old.save({ ...emptySave(), runs: 999 })).toBe(false)
      expect(w.storage.copies.map((b) => b.source)).toEqual(
        expect.arrayContaining(["resolve-local", "resolve-cloud"]),
      )
    },
  )
  it("does not send resolve or replace the active copy if local backup fails", async () => {
    const w = world(),
      { c, p } = await seeded(w)
    await p.port.save({ ...emptySave(), runs: 4 })
    w.clouds.set("A", remote("2", JSON.parse(raw(20))))
    await c.flush()
    const before = c.snapshot().raw,
      count = w.calls.length
    w.storage.fail = true
    await expect(c.choose("cloud")).rejects.toThrow()
    expect(c.snapshot().raw).toBe(before)
    expect(w.calls).toHaveLength(count)
    expect(w.clouds.get("A")!.revision).toBe("2")
  })
  it("preserves both candidates and a fixed resolve mutation when remote backup/write fails", async () => {
    const w = world(),
      { c, p } = await seeded(w)
    await p.port.save({ ...emptySave(), runs: 4 })
    w.clouds.set("A", remote("2", JSON.parse(raw(20))))
    await c.flush()
    w.reject(new ApiError("unavailable", 503, 5))
    await c.choose("cloud")
    expect(JSON.parse(c.snapshot().raw!).runs).toBe(4)
    const pending = (await w.storage.read("A"))!.pending!
    expect(pending.replace).toBe(true)
    expect(c.snapshot().locked).toBe(true)
    w.reject(null)
    w.time(10000)
    await c.retry()
    expect(JSON.parse(c.snapshot().raw!).runs).toBe(20)
    expect(w.calls.filter((x) => x.body?.mutationId === pending.body.mutationId)).toHaveLength(2)
  })
  it("never substitutes an empty save for an unknown local or cloud schema", async () => {
    const w = world()
    w.clouds.set("A", remote("1", { schema: 999, secretFuture: [1, 2] }))
    const c = w.create()
    await c.identity("A", true)
    expect(c.snapshot().status).toBe("incompatible")
    expect(c.snapshot().ready).toBe(false)
    expect(c.snapshot().raw).toContain("secretFuture")
    await c.flush()
    expect(w.calls.filter((x) => x.body)).toHaveLength(0)
    w.setGuest(' {"schema":999,"original":"intact"} ')
    await c.identity("guest", false, true)
    expect(c.snapshot().raw).toBe(w.guest())
    await expect(c.attach().port.load()).rejects.toThrow()
    expect(w.guest()).toContain("original")
  })
  it("does not leak old account writes or late network responses into a new account", async () => {
    const w = world(),
      { c, p } = await seeded(w),
      request = w.env.request
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    let sent!: () => void
    const started = new Promise<void>((r) => {
      sent = r
    })
    w.env.request = async (owner, path, options) => {
      if (owner === "A" && options?.body) {
        sent()
        await gate
      }
      return request(owner, path, options)
    }
    await p.port.save({ ...emptySave(), runs: 12 })
    const flight = c.flush()
    await started
    await c.identity("B", true, true)
    release()
    await flight
    expect(JSON.parse(c.snapshot().raw!).runs).toBe(0)
    expect(await p.port.save({ ...emptySave(), runs: 1000 })).toBe(false)
    expect((await w.storage.read("A"))!.pending).not.toBeNull()
    expect(
      w.calls
        .filter((x) => x.owner === "B" && x.body?.payload)
        .every((x) => (x.body!.payload as GameSave).runs === 0),
    ).toBe(true)
  })
  it("checkpoints and asks for review on an unapproved cross-tab identity change", async () => {
    const w = world(),
      { c } = await seeded(w)
    await c.identity("B", true)
    expect(c.snapshot().scope).toBe("A")
    expect(c.snapshot().status).toBe("review")
    expect(w.env.pause).toHaveBeenCalled()
    await c.acceptIdentity()
    expect(c.snapshot().scope).toBe("B")
  })
  it("keeps cached account progress on expired auth until Guest is explicitly opened", async () => {
    const w = world(),
      { c } = await seeded(w)
    await c.identity("A", false)
    expect(c.snapshot().scope).toBe("A")
    expect(c.snapshot().locked).toBe(true)
    expect(c.snapshot().status).toBe("auth")
    await c.identity("guest", false, true)
    expect(c.snapshot().scope).toBe("guest")
    expect(w.guest()).toBe(raw(7))
  })
  it("refuses a stale tab write atomically and backs up its attempted checkpoint", async () => {
    const w = world(),
      a = await seeded(w),
      b = await opened(w)
    expect(await a.p.port.save({ ...emptySave(), runs: 1 })).toBe(true)
    expect(await b.p.port.save({ ...emptySave(), runs: 2 })).toBe(false)
    expect(b.c.snapshot().status).toBe("peer")
    expect(JSON.parse((await w.storage.read("A"))!.raw!).runs).toBe(1)
    expect(w.storage.copies.some((x) => x.source === "stale-tab" && JSON.parse(x.raw).runs === 2)).toBe(true)
    await b.c.reloadLocal()
    expect(JSON.parse(b.c.snapshot().raw!).runs).toBe(1)
  })
  it("preserves pending City/Daily checkpoints exactly when selecting cloud", async () => {
    const w = world(),
      { c, p } = await seeded(w)
    await p.port.save({ ...emptySave(), runs: 1 })
    let city = emptySave()
    city.city = beginCityTower(city.city, 12, "residential", 42)
    const context = allocateRun(city, 1)
    city = context.save
    city.tracking.pendingCity = { ...context.context, cityRunId: city.city.pending!.runId }
    const daily = resolveDaily("2026-10-15"),
      allocated = allocateRun(city, 2),
      game = new QuickTowerGame({
        mode: "daily",
        seed: daily.seed,
        assist: false,
        building: daily.classId,
        daily,
      })
    const both = {
      ...allocated.save,
      daily: checkpointDaily(beginDaily(allocated.save.daily, game, allocated.context), game),
    }
    w.clouds.set("A", remote("2", both))
    await c.flush()
    await c.choose("cloud")
    const stored = JSON.parse(c.snapshot().raw!)
    expect(stored.city.pending.checkpoint).toEqual(both.city.pending!.checkpoint)
    expect(stored.daily.pending.checkpoint).toEqual(both.daily.pending!.checkpoint)
  })
  it("does not enable account writes if local durable storage fails", async () => {
    const w = world(),
      { c, p } = await seeded(w)
    w.storage.fail = true
    expect(await p.port.save({ ...emptySave(), runs: 99 })).toBe(false)
    expect(c.snapshot().status).toBe("storage")
    expect(w.clouds.get("A")!.revision).toBe("1")
  })
  it("backs up a definitively rejected mutation before allowing a new corrected snapshot", async () => {
    const w = world(),
      { c, p } = await seeded(w)
    await p.port.save({ ...emptySave(), runs: 1 })
    w.reject(new ApiError("invalid", 422))
    await c.flush()
    expect((await w.storage.read("A"))!.pending).toBeNull()
    expect(w.storage.copies.some((b) => b.source === "rejected-mutation")).toBe(true)
    const rejected = w.calls.findLast((call) => call.body)!.body!.mutationId
    w.reject(null)
    w.time(10000)
    await p.port.save({ ...emptySave(), runs: 2 })
    await c.flush()
    expect(w.calls.findLast((call) => call.body)!.body!.mutationId).not.toBe(rejected)
    expect((w.clouds.get("A")!.payload as GameSave).runs).toBe(2)
  })
  it("keeps the newest identity when an older account switch finishes checkpointing late", async () => {
    const w = world(),
      { c } = await seeded(w)
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    vi.mocked(w.env.pause).mockImplementationOnce(async () => {
      await gate
      return true
    })
    const older = c.identity("B", true, true)
    await c.identity("C", true, true)
    release()
    await older
    expect(c.snapshot().scope).toBe("C")
    expect(await w.storage.read("B")).toBeNull()
  })
  it("preserves decimal revision precision beyond the JavaScript safe integer limit", async () => {
    const w = world()
    w.clouds.set("A", remote("9007199254740993", JSON.parse(raw())))
    const { c, p } = await opened(w)
    await p.port.save({ ...emptySave(), runs: 1 })
    await c.flush()
    expect(c.snapshot().revision).toBe("9007199254740994")
    expect(w.calls.findLast((call) => call.body)!.body!.expectedRevision).toBe("9007199254740993")
  })
})
