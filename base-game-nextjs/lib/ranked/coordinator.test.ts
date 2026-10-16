import { describe, it, expect } from "vitest";
import { RankedCoordinator } from "./coordinator";
import type { RankedRun, RankedStorage, StartTicket } from "./storage";
import { ApiError } from "../api/api-client";
import {
  emptySave,
  allocateRun,
  beginDaily,
  checkpointDaily,
  QuickTowerGame,
  restoreTower,
  resolveDaily,
  type RunRecord,
} from "../../../packages/city-bloxx-core/src/index";
import quickFixture from "../../../packages/city-bloxx-core/fixtures/quick-mixed-v13.json";
import dailyFixture from "../../../packages/city-bloxx-core/fixtures/daily-v1.json";
const quick = quickFixture as RunRecord,
  daily = dailyFixture.complete as RunRecord;
const clone = <T>(v: T) => structuredClone(v);
class Memory implements RankedStorage {
  data = new Map<string, RankedRun[]>();
  fail = false;
  tail = Promise.resolve();
  read = async (owner: string) => clone(this.data.get(owner) ?? []);
  change(owner: string, fn: (runs: RankedRun[]) => RankedRun[]) {
    const work = this.tail.then(() => {
      if (this.fail) throw new Error("storage");
      const runs = fn(clone(this.data.get(owner) ?? []));
      this.data.set(owner, clone(runs));
      return clone(runs);
    });
    this.tail = work.then(
      () => {},
      () => {},
    );
    return work;
  }
}
function setup(storage = new Memory()) {
  let owner: string | null = "A",
    authenticated = true,
    now = Date.parse("2026-10-16T00:00:00Z"),
    sequence = 0,
    online = true;
  const calls: {
      owner: string;
      path: string;
      body: Record<string, unknown> | null;
    }[] = [],
    scheduled: { work: () => void; delay: number }[] = [];
  const receipts = new Map<string, StartTicket>();
  let handler: (
    owner: string,
    path: string,
    options?: RequestInit,
  ) => Promise<unknown> = async (_owner, path, options) => {
    if (path.endsWith("/start")) {
      const body = JSON.parse(options!.body as string) as {
        mode: string;
        clientRequestId: string;
      };
      if (!receipts.has(body.clientRequestId))
        receipts.set(body.clientRequestId, {
          runId: body.clientRequestId,
          ticket: "x".repeat(43),
          config: clone(body.mode === "daily" ? daily.config : quick.config),
          physicsVersion: quick.physicsVersion,
          rulesetVersion:
            body.mode === "daily" ? daily.rulesetVersion : quick.rulesetVersion,
          issuedAt: new Date(now).toISOString(),
          expiresAt: new Date(now + 86400000).toISOString(),
        });
      return clone(receipts.get(body.clientRequestId));
    }
    const body = options?.body ? JSON.parse(options.body as string) : null;
    return {
      runId: body?.runId ?? path.split("/").at(-1),
      status: "accepted",
      result: quick.result,
      boardEligible: true,
      rejectCode: null,
    };
  };
  const env = {
    storage,
    owner: () => owner,
    authenticated: (id: string) => authenticated && owner === id,
    request: async <T>(id: string, path: string, options?: RequestInit) => {
      calls.push({
        owner: id,
        path,
        body: options?.body ? JSON.parse(options.body as string) : null,
      });
      return (await handler(id, path, options)) as T;
    },
    uuid: () =>
      `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`,
    now: () => now,
    online: () => online,
    lock: async <T>(_id: string, work: () => Promise<T>) => work(),
    post: () => {},
    schedule: (work: () => void, delay: number) => {
      scheduled.push({ work, delay });
      return () => {};
    },
  };
  const coordinator = new RankedCoordinator(env),
    port = coordinator.port("A");
  return {
    storage,
    calls,
    scheduled,
    env,
    coordinator,
    port,
    receipts,
    handler: (next: typeof handler) => {
      const previous = handler;
      handler = next;
      return previous;
    },
    account: (id: string | null, auth = true) => {
      owner = id;
      authenticated = auth;
    },
    advance: (ms: number) => {
      now += ms;
    },
    offline: (value = true) => {
      online = !value;
    },
    ready: () => coordinator.identity(owner),
    drain: () => coordinator.flush(),
    record: () => storage.read("A"),
  };
}
describe("owner-bound ranked tickets and durable queue", () => {
  it("persists request ID and ticket before binding; no game result or owner fields are sent on start", async () => {
    const h = setup();
    await h.ready();
    const t = await h.port.start("quick");
    expect((await h.record())[0]).toMatchObject({
      id: t.id,
      state: "active",
      localId: null,
    });
    expect(h.calls[0].body).toEqual({ mode: "quick", clientRequestId: t.id });
    await h.port.bind(t.id, "local:1");
    expect((await h.record())[0].localId).toBe("local:1");
  });
  it("reuses a consumed/lost start response with the exact clientRequestId after reload", async () => {
    const h = setup();
    await h.ready();
    const original = h.handler(async (owner, path, options) => {
      await original(owner, path, options);
      throw new ApiError("network");
    });
    await expect(h.port.start("quick")).rejects.toThrow();
    const id = (await h.record())[0].id;
    h.handler(original);
    h.advance(2000);
    const reloaded = new RankedCoordinator(h.env);
    await reloaded.identity("A");
    expect((await reloaded.port("A").start("quick")).id).toBe(id);
    expect(h.calls.map((c) => c.body?.clientRequestId)).toEqual([id, id]);
  });
  it("reuses an unbound ticket after cancelled artwork/navigation without minting another ticket", async () => {
    const h = setup();
    await h.ready();
    const t = await h.port.start("quick"),
      again = await h.port.start("quick");
    expect(again.id).toBe(t.id);
    expect(h.calls).toHaveLength(1);
  });
  it("fails closed on storage failure before HTTP and before completion durability", async () => {
    const h = setup();
    await h.ready();
    h.storage.fail = true;
    await expect(h.port.start("quick")).rejects.toThrow();
    expect(h.calls).toHaveLength(0);
    h.storage.fail = false;
    const t = await h.port.start("quick");
    await h.port.bind(t.id, "local:1");
    h.storage.fail = true;
    await expect(h.port.complete(t.id, quick)).rejects.toThrow();
    expect((await h.record())[0].state).toBe("active");
    h.storage.fail = false;
    await h.coordinator.retry();
    await h.drain();
    expect((await h.record())[0].state).toBe("accepted");
  });
  it("queues offline before HTTP, survives reload and keeps the exact finish body", async () => {
    const h = setup();
    await h.ready();
    const t = await h.port.start("quick");
    await h.port.bind(t.id, "local:1");
    h.offline();
    await h.port.complete(t.id, quick);
    await h.drain();
    const body = (await h.record())[0].body;
    expect(h.calls).toHaveLength(1);
    expect(body).not.toHaveProperty("result");
    h.offline(false);
    const reloaded = new RankedCoordinator(h.env);
    await reloaded.identity("A");
    await reloaded.flush();
    expect(h.calls[1].body).toEqual(body);
    expect((await h.record())[0].state).toBe("accepted");
  });
  it("retries an immutable consumed finish response after reload, without changing ID, inputs or endTick", async () => {
    const h = setup();
    await h.ready();
    const t = await h.port.start("quick");
    await h.port.bind(t.id, "local:1");
    const original = h.handler(async (owner, path, options) => {
      if (path.endsWith("/finish")) throw new ApiError("network");
      return original(owner, path, options);
    });
    await h.port.complete(t.id, quick);
    await h.drain();
    const first = h.calls.at(-1)!.body;
    h.handler(original);
    h.advance(2000);
    const reloaded = new RankedCoordinator(h.env);
    await reloaded.identity("A");
    await reloaded.flush();
    expect(h.calls.at(-1)!.body).toEqual(first);
    expect((await h.record())[0].state).toBe("accepted");
  });
  it("polls processing every two seconds; re-authentication reposts the original body to rebind the session", async () => {
    const h = setup();
    await h.ready();
    const t = await h.port.start("quick");
    await h.port.bind(t.id, "local:1");
    h.handler(async (_owner, path, options) => ({
      runId: options?.body
        ? JSON.parse(options.body as string).runId
        : path.split("/").at(-1),
      status: "processing",
      result: null,
      boardEligible: null,
      rejectCode: null,
    }));
    await h.port.complete(t.id, quick);
    await h.drain();
    expect(h.scheduled.at(-1)?.delay).toBe(2000);
    h.advance(2000);
    await h.drain();
    expect(h.calls.at(-1)!.path).toContain(`/runs/${t.id}`);
    h.account("A", false);
    await h.ready();
    h.account("A");
    h.advance(2000);
    await h.ready();
    await h.drain();
    expect(h.calls.at(-1)!.path).toBe("/city-bloxx/runs/finish");
  });
  it.each([429, 503])(
    "persists and respects Retry-After %s across manual retry and reload",
    async (status) => {
      const h = setup();
      await h.ready();
      const t = await h.port.start("quick");
      await h.port.bind(t.id, "local:1");
      h.handler(async () => {
        throw new ApiError(status === 429 ? "rate" : "unavailable", status, 60);
      });
      await h.port.complete(t.id, quick);
      await h.drain();
      const count = h.calls.length;
      await h.coordinator.retry();
      await h.drain();
      expect(h.calls).toHaveLength(count);
      h.advance(59000);
      await h.drain();
      expect(h.calls).toHaveLength(count);
      h.advance(1000);
      await h.drain();
      expect(h.calls).toHaveLength(count + 1);
    },
  );
  it("parks a 401 queue until the same account reauthenticates; never sends A under B", async () => {
    const h = setup();
    await h.ready();
    const t = await h.port.start("quick");
    await h.port.bind(t.id, "local:1");
    const original = h.handler(async () => {
      throw new ApiError("expired", 401);
    });
    await h.port.complete(t.id, quick);
    await h.drain();
    const calls = h.calls.length;
    h.account("B");
    await h.ready();
    h.advance(10000);
    await h.drain();
    expect(h.calls).toHaveLength(calls);
    expect(h.coordinator.snapshot().runs).toEqual([]);
    h.handler(original);
    h.account("A");
    await h.ready();
    await h.drain();
    expect((await h.record())[0].state).toBe("accepted");
    expect(h.calls.every((c) => c.owner === "A")).toBe(true);
  });
  it("ignores a late A response for B's visible state", async () => {
    const h = setup();
    await h.ready();
    const t = await h.port.start("quick");
    await h.port.bind(t.id, "local:1");
    let reply!: (v: unknown) => void;
    h.handler(
      () =>
        new Promise((resolve) => {
          reply = resolve;
        }),
    );
    await h.port.complete(t.id, quick);
    const flight = h.drain();
    await new Promise((r) => setTimeout(r, 0));
    h.account("B");
    await h.ready();
    reply({
      runId: t.id,
      status: "accepted",
      result: quick.result,
      boardEligible: true,
      rejectCode: null,
    });
    await flight;
    expect(h.coordinator.snapshot().owner).toBe("B");
    expect(h.coordinator.snapshot().runs).toEqual([]);
    expect((await h.record())[0].state).not.toBe("accepted");
  });
  it("preserves expired/rejected personal summaries while removing ticket and input secrets", async () => {
    const h = setup();
    await h.ready();
    const t = await h.port.start("quick");
    await h.port.bind(t.id, "local:1");
    h.handler(async () => {
      throw new ApiError("invalid", 410);
    });
    await h.port.complete(t.id, quick);
    await h.drain();
    expect((await h.record())[0]).toMatchObject({
      state: "expired",
      ticket: null,
      body: null,
      localResult: quick.result,
    });
  });
  it("reads an accepted response after local ticket TTL rather than silently expiring an already committed finish", async () => {
    const h = setup();
    await h.ready();
    const t = await h.port.start("quick");
    await h.port.bind(t.id, "local:1");
    h.offline();
    await h.port.complete(t.id, quick);
    await h.drain();
    h.advance(90000000);
    h.offline(false);
    await h.drain();
    expect((await h.record())[0].state).toBe("accepted");
  });
  it("resumes only the original Daily identity/config; personal/imported progress cannot acquire a new ticket", async () => {
    const h = setup();
    await h.ready();
    const t = await h.port.start("daily");
    await h.port.bind(t.id, "daily:1");
    expect(await h.port.resume("daily:other", daily.config)).toBeNull();
    expect(
      await h.port.resume("daily:1", { ...daily.config, seed: 42 }),
    ).toBeNull();
    const reloaded = new RankedCoordinator(h.env);
    await reloaded.identity("A");
    expect(await reloaded.port("A").resume("daily:1", daily.config)).toBe(t.id);
    expect(t.config.daily).toEqual(resolveDaily(daily.config.daily!.dateUTC));
  });
  it("fences another tab binding the same ticket, even if its stale C4 identity is identical", async () => {
    const h = setup();
    await h.ready();
    const t = await h.port.start("quick"),
      other = h.coordinator.port("A");
    await h.port.bind(t.id, "local:1");
    await expect(other.bind(t.id, "local:1")).rejects.toThrow();
  });
  it("enforces 16 pending attempts before issuing more HTTP requests", async () => {
    const h = setup();
    await h.ready();
    for (let i = 0; i < 16; i++) {
      const t = await h.port.start("quick");
      await h.port.bind(t.id, `local:${i}`);
    }
    await expect(h.port.start("quick")).rejects.toThrow("full");
    expect(h.calls).toHaveLength(16);
  });
  it("recovers a failed completion only from its pre-bound local replay; personal saves alone never submit", async () => {
    const h = setup();
    await h.ready();
    const save = emptySave();
    save.replays = [{ id: "local:1", record: quick }];
    await h.port.recover(save);
    expect(h.calls).toHaveLength(0);
    const t = await h.port.start("quick");
    await h.port.bind(t.id, "local:1");
    await h.port.recover(save);
    await h.drain();
    expect((await h.record())[0].state).toBe("accepted");
  });
  it("recovers a completed Daily checkpoint after its personal replay was evicted", async () => {
    const h = setup();
    await h.ready();
    const ticket = await h.port.start("daily");
    const allocated = allocateRun(emptySave(), 1),
      save = allocated.save;
    save.daily = beginDaily(
      save.daily,
      new QuickTowerGame(daily.config),
      allocated.context,
    );
    save.daily = checkpointDaily(
      save.daily,
      restoreTower({
        version: daily.physicsVersion,
        config: daily.config,
        tick: daily.endTick,
        inputs: daily.inputs,
      }),
    );
    await h.port.bind(ticket.id, allocated.context.identity.id);
    expect(save.replays).toEqual([]);
    await h.port.recover(save);
    await h.drain();
    expect((await h.record())[0].state).toBe("accepted");
    expect(h.calls.at(-1)?.body?.inputs).toEqual(daily.inputs);
  });
  it("does not expose ticket/inputs in UI snapshots or touch C4 XP/rewards on server acceptance", async () => {
    const h = setup();
    await h.ready();
    const save = emptySave(),
      before = JSON.stringify(save),
      t = await h.port.start("quick");
    await h.port.bind(t.id, "local:1");
    await h.port.complete(t.id, quick);
    await h.drain();
    expect(JSON.stringify(save)).toBe(before);
    expect(JSON.stringify(h.coordinator.snapshot())).not.toContain('"ticket"');
    expect(JSON.stringify(h.coordinator.snapshot())).not.toContain('"inputs"');
  });
});
