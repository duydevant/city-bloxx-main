import {
  PHYSICS_VERSION,
  RULESET_VERSION,
  QuickTowerGame,
  restoreTower,
  resolveDaily,
  type GameSave,
  type RunConfig,
  type RunRecord,
} from "../../../packages/city-bloxx-core/src/index";
import type { RankedPort } from "../../../packages/city-bloxx-core/src/ports";
import { ApiError } from "../api/api-client";
import type {
  FinishBody,
  RankedRun,
  RankedStorage,
  StartTicket,
} from "./storage";

const terminal = (r: RankedRun) =>
  ["accepted", "rejected", "expired", "abandoned"].includes(r.state);
const canonical = (v: unknown): string =>
  JSON.stringify(v, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, value[k]]),
        )
      : value,
  );
export type PublicRun = Pick<
  RankedRun,
  | "id"
  | "mode"
  | "state"
  | "localResult"
  | "verifiedResult"
  | "boardEligible"
  | "retryAt"
  | "error"
  | "createdAt"
>;
export interface RankedSnapshot {
  owner: string | null;
  ready: boolean;
  issue: string | null;
  runs: PublicRun[];
}
export const INITIAL_RANKED: RankedSnapshot = {
  owner: null,
  ready: false,
  issue: null,
  runs: [],
};
interface Environment {
  storage: RankedStorage;
  owner(): string | null;
  authenticated(owner: string): boolean;
  request<T>(owner: string, path: string, options?: RequestInit): Promise<T>;
  uuid(): string;
  now(): number;
  online(): boolean;
  lock<T>(owner: string, work: () => Promise<T>): Promise<T>;
  schedule(work: () => void, delay: number): () => void;
  post(owner: string): void;
}
interface RunStatus {
  runId: string;
  status: string;
  result: RunRecord["result"] | null;
  boardEligible: boolean | null;
  rejectCode: string | null;
}
export class RankedCoordinator {
  private state = INITIAL_RANKED;
  private listeners = new Set<() => void>();
  private stop = () => {};
  private epoch = 0;
  private flights = new Map<string, Promise<void>>();
  private paused = new Set<string>();
  private rebound = new Set<string>();
  private volatile = new Map<
    string,
    { owner: string; id: string; record: RunRecord; controller?: string }
  >();
  constructor(private readonly env: Environment) {}
  snapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private emit(patch: Partial<RankedSnapshot>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  private show(owner: string, runs: RankedRun[], issue: string | null = null) {
    if (this.state.owner !== owner) return;
    this.emit({
      ready: true,
      issue,
      runs: runs.map(
        ({
          id,
          mode,
          state,
          localResult,
          verifiedResult,
          boardEligible,
          retryAt,
          error,
          createdAt,
        }) => ({
          id,
          mode,
          state,
          localResult,
          verifiedResult,
          boardEligible,
          retryAt,
          error,
          createdAt,
        }),
      ),
    });
  }
  private async change(owner: string, fn: (runs: RankedRun[]) => RankedRun[]) {
    try {
      const runs = await this.env.storage.change(owner, fn);
      this.show(owner, runs);
      this.env.post(owner);
      return runs;
    } catch (error) {
      const issue =
        error instanceof Error && error.message === "full" ? "full" : "storage";
      if (this.state.owner === owner) this.emit({ issue });
      throw error;
    }
  }
  async identity(owner: string | null) {
    const epoch = ++this.epoch;
    this.stop();
    this.rebound.clear();
    this.emit({ owner, ready: false, runs: [], issue: null });
    if (!owner) {
      this.emit({ ready: true });
      return;
    }
    this.paused.delete(owner);
    try {
      const runs = await this.env.storage.read(owner);
      if (epoch !== this.epoch) return;
      this.show(owner, runs);
      void this.flush().catch(() => {});
    } catch {
      if (epoch === this.epoch) this.emit({ ready: false, issue: "storage" });
    }
  }
  async refresh(owner: string) {
    if (this.state.owner !== owner) return;
    try {
      this.show(owner, await this.env.storage.read(owner));
      void this.flush();
    } catch {
      this.emit({ issue: "storage" });
    }
  }
  private auth(owner: string) {
    if (this.env.owner() !== owner || !this.env.authenticated(owner))
      throw new ApiError("account-changed");
  }
  private async request<T>(owner: string, path: string, options?: RequestInit) {
    this.auth(owner);
    const response = await this.env.request<T>(owner, path, options);
    this.auth(owner);
    return response;
  }
  port(owner: string): RankedPort {
    const controller = this.env.uuid();
    return {
      start: (mode) => this.start(owner, mode),
      bind: (id, localId) => this.bind(owner, id, localId, controller),
      complete: (id, record) => this.complete(owner, id, record, controller),
      resume: (localId, config) =>
        this.resume(owner, localId, config, controller),
      abandon: (localId) => this.abandon(owner, localId),
      recover: (save) => this.recover(owner, save),
    };
  }
  private validateTicket(ticket: StartTicket, mode: string) {
    if (
      !ticket ||
      !/^[a-f0-9-]{36}$/i.test(ticket.runId) ||
      !/^[A-Za-z0-9_-]{43}$/.test(ticket.ticket) ||
      ticket.physicsVersion !== PHYSICS_VERSION ||
      ticket.config?.mode !== mode ||
      ticket.config.assist !== false ||
      !Number.isSafeInteger(ticket.config.seed) ||
      !Number.isFinite(Date.parse(ticket.issuedAt)) ||
      !Number.isFinite(Date.parse(ticket.expiresAt)) ||
      Date.parse(ticket.expiresAt) <= Date.parse(ticket.issuedAt)
    )
      throw new ApiError("unsupported");
    const expected =
      mode === "daily" ? resolveDaily(ticket.config.daily!.dateUTC) : null;
    if (ticket.rulesetVersion !== (expected?.rulesetVersion ?? RULESET_VERSION))
      throw new ApiError("unsupported");
    const config = expected
      ? { ...ticket.config, building: expected.classId }
      : ticket.config;
    new QuickTowerGame(config);
    return { ...ticket, config };
  }
  async start(owner: string, mode: "quick" | "daily") {
    return this.env.lock(owner, async () => {
      this.auth(owner);
      if (!this.env.online()) throw new ApiError("network");
      let selected: RankedRun | undefined;
      await this.change(owner, (runs) => {
        runs = runs.map((r) =>
          r.state === "active" &&
          !r.body &&
          r.ticket &&
          Date.parse(r.ticket.expiresAt) <= this.env.now()
            ? { ...r, state: "expired" as const, ticket: null }
            : r,
        );
        selected =
          runs.find((r) => r.state === "starting" && r.mode === mode) ??
          runs.find(
            (r) =>
              r.state === "active" && r.mode === mode && !r.localId && r.ticket,
          );
        if (!selected) {
          if (runs.filter((r) => !terminal(r)).length >= 16)
            throw new Error("full");
          selected = {
            id: this.env.uuid(),
            mode,
            state: "starting",
            ticket: null,
            runId: null,
            localId: null,
            body: null,
            controller: null,
            localResult: null,
            verifiedResult: null,
            boardEligible: null,
            createdAt: this.env.now(),
            retryAt: 0,
            attempts: 0,
            error: null,
          };
          runs = [...runs, selected];
        }
        return [
          ...runs.filter((r) => !terminal(r)),
          ...runs.filter(terminal).slice(-32),
        ];
      });
      const entry = selected!;
      if (entry.state === "active" && entry.ticket)
        return { id: entry.id, config: entry.ticket.config };
      if (entry.retryAt > this.env.now())
        throw new ApiError(
          "rate",
          429,
          Math.ceil((entry.retryAt - this.env.now()) / 1000),
        );
      try {
        const ticket = this.validateTicket(
          await this.request<StartTicket>(owner, "/city-bloxx/runs/start", {
            method: "POST",
            body: JSON.stringify({ mode, clientRequestId: entry.id }),
          }),
          mode,
        );
        await this.change(owner, (runs) =>
          runs.map((r) =>
            r.id === entry.id
              ? {
                  ...r,
                  state: "active",
                  ticket,
                  runId: ticket.runId,
                  error: null,
                }
              : r,
          ),
        );
        return { id: entry.id, config: ticket.config };
      } catch (error) {
        await this.failure(owner, entry, error);
        throw error;
      }
    });
  }
  private async bind(
    owner: string,
    id: string,
    localId: string,
    controller: string,
  ) {
    this.auth(owner);
    await this.change(owner, (runs) =>
      runs.map((r) => {
        if (r.id !== id) return r;
        if (
          r.state !== "active" ||
          (r.localId && r.localId !== localId) ||
          (r.controller && r.controller !== controller)
        )
          throw new Error("binding");
        return { ...r, localId, controller };
      }),
    );
  }
  private async resume(
    owner: string,
    localId: string,
    config: RunConfig,
    controller: string,
  ) {
    const r = (await this.env.storage.read(owner)).find(
      (r) => r.localId === localId && r.state === "active",
    );
    if (!r?.ticket || canonical(r.ticket.config) !== canonical(config))
      return null;
    await this.change(owner, (runs) =>
      runs.map((current) =>
        current.id === r.id && current.state === "active"
          ? { ...current, controller }
          : current,
      ),
    );
    return r.id;
  }
  private async complete(
    owner: string,
    id: string,
    record: RunRecord,
    controller?: string,
  ) {
    const key = `${owner}:${id}`;
    this.volatile.set(key, {
      owner,
      id,
      record: structuredClone(record),
      controller,
    });
    await this.change(owner, (runs) =>
      runs.map((r) => {
        if (r.id !== id || terminal(r)) return r;
        const t = r.ticket;
        if (
          !t ||
          !r.localId ||
          (controller && r.controller && controller !== r.controller) ||
          canonical(t.config) !== canonical(record.config) ||
          t.physicsVersion !== record.physicsVersion ||
          t.rulesetVersion !== record.rulesetVersion
        )
          throw new Error("binding");
        const body: FinishBody = {
          runId: t.runId,
          ticket: t.ticket,
          physicsVersion: t.physicsVersion,
          rulesetVersion: t.rulesetVersion,
          inputs: record.inputs,
          endTick: record.endTick,
        };
        if (r.body && canonical(r.body) !== canonical(body))
          throw new Error("immutable");
        return {
          ...r,
          body: r.body ?? body,
          localResult: record.result,
          state: r.state === "processing" ? "processing" : "queued",
          error: null,
        };
      }),
    );
    this.volatile.delete(key);
    void this.flush().catch(() => {});
  }
  private async abandon(owner: string, localId: string) {
    await this.change(owner, (runs) =>
      runs.map((r) =>
        r.localId === localId && r.state === "active"
          ? { ...r, state: "abandoned", ticket: null }
          : r,
      ),
    );
  }
  private async recover(owner: string, save: GameSave) {
    for (const r of await this.env.storage.read(owner)) {
      if (r.state !== "active" || !r.localId) continue;
      const replay = save.replays.find((replay) => replay.id === r.localId);
      const pending = save.daily.pending;
      const completedDaily =
        !replay && pending?.identity.id === r.localId
          ? restoreTower(pending.checkpoint)
          : null;
      if (replay) await this.complete(owner, r.id, replay.record);
      else if (completedDaily?.getPhase() === "ended")
        await this.complete(owner, r.id, completedDaily.getRecord());
      else if (
        r.mode === "quick" &&
        save.tracking.activeQuick?.identity.id !== r.localId
      )
        await this.abandon(owner, r.localId);
    }
  }
  private async failure(owner: string, r: RankedRun, error: unknown) {
    const e = error instanceof ApiError ? error : null;
    if (
      (e && [401, 403].includes(e.status)) ||
      (e?.issue === "account-changed" && !this.env.authenticated(owner))
    )
      this.paused.add(owner);
    const issue = e?.issue ?? "storage";
    const delays = [2000, 5000, 15000, 30000, 60000],
      delay = Math.max(
        delays[Math.min(r.attempts, 4)],
        (e?.retryAfter ?? 0) * 1000,
      );
    const permanent = e && [400, 409, 410, 413, 422].includes(e.status);
    await this.change(owner, (runs) =>
      runs.map((current) =>
        current.id !== r.id || terminal(current)
          ? current
          : {
              ...current,
              error: issue,
              attempts: current.attempts + 1,
              retryAt: this.env.now() + delay,
              ...(permanent
                ? {
                    state:
                      e.status === 410
                        ? ("expired" as const)
                        : ("rejected" as const),
                    ticket: null,
                    body: null,
                  }
                : {}),
            },
      ),
    ).catch(() => {});
    if (this.state.owner === owner) this.emit({ issue });
  }
  private async send(owner: string, r: RankedRun) {
    if (!r.body || !r.runId) return;
    try {
      const post =
        r.state === "queued" || !this.rebound.has(`${owner}:${r.id}`);
      const status = await this.request<RunStatus>(
        owner,
        post ? "/city-bloxx/runs/finish" : `/city-bloxx/runs/${r.runId}`,
        post ? { method: "POST", body: JSON.stringify(r.body) } : undefined,
      );
      if (
        status.runId !== r.runId ||
        !["accepted", "rejected", "expired", "processing"].includes(
          status.status,
        )
      )
        throw new ApiError("unavailable");
      if (status.status === "accepted" && !status.result)
        throw new ApiError("unavailable");
      this.rebound.add(`${owner}:${r.id}`);
      await this.change(owner, (runs) =>
        runs.map((current) =>
          current.id !== r.id || terminal(current)
            ? current
            : {
                ...current,
                state: status.status as RankedRun["state"],
                verifiedResult: status.result,
                boardEligible: status.boardEligible,
                error: status.rejectCode,
                retryAt: this.env.now() + 2000,
                attempts: 0,
                ...(["accepted", "rejected", "expired"].includes(status.status)
                  ? { ticket: null, body: null }
                  : {}),
              },
        ),
      );
    } catch (error) {
      await this.failure(owner, r, error);
    }
  }
  flush = async () => {
    const owner = this.state.owner;
    if (
      !owner ||
      !this.env.authenticated(owner) ||
      this.env.owner() !== owner ||
      this.paused.has(owner)
    )
      return;
    if (this.flights.has(owner)) return this.flights.get(owner);
    this.stop();
    const task = this.env
      .lock(owner, async () => {
        if (!this.env.online()) {
          if (this.state.owner === owner) this.emit({ issue: "network" });
          return;
        }
        const runs = await this.env.storage.read(owner);
        for (const r of runs) {
          if (
            this.env.owner() !== owner ||
            !this.env.authenticated(owner) ||
            this.paused.has(owner)
          )
            break;
          if (
            ["queued", "processing"].includes(r.state) &&
            r.retryAt <= this.env.now()
          )
            await this.send(owner, r);
        }
      })
      .catch(() => {
        if (this.state.owner === owner) this.emit({ issue: "storage" });
      })
      .finally(async () => {
        this.flights.delete(owner);
        if (
          this.state.owner !== owner ||
          this.paused.has(owner) ||
          !this.env.online()
        )
          return;
        try {
          const pending = (await this.env.storage.read(owner)).filter((r) =>
            ["queued", "processing"].includes(r.state),
          );
          if (pending.length)
            this.stop = this.env.schedule(
              () => {
                void this.flush();
              },
              Math.max(
                2000,
                Math.min(...pending.map((r) => r.retryAt)) - this.env.now(),
              ),
            );
        } catch {
          this.emit({ issue: "storage" });
        }
      });
    this.flights.set(owner, task);
    return task;
  };
  async retry() {
    const owner = this.state.owner;
    if (!owner) return;
    this.paused.delete(owner);
    for (const v of [...this.volatile.values()])
      if (v.owner === owner)
        await this.complete(owner, v.id, v.record, v.controller);
    await this.refresh(owner);
    await this.flush();
  }
}
