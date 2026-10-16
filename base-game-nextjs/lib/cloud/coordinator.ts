import { emptySave, type GameSave, type SavePort } from "../../../packages/city-bloxx-core/src/index"
import { ApiError } from "../api/api-client"
import { parseSave, sameSave } from "./guest"
import { type AccountSave, type CloudSnapshot, type CloudStorage, type Mutation } from "./storage"

export type CloudStatus =
  | "loading"
  | "guest"
  | "saved"
  | "pending"
  | "syncing"
  | "offline"
  | "auth"
  | "conflict"
  | "peer"
  | "review"
  | "storage"
  | "incompatible"
  | "rejected"
export interface CloudView {
  scope: string | null
  ready: boolean
  locked: boolean
  mount: number
  status: CloudStatus
  raw: string | null
  remote: CloudSnapshot | null
  revision: string
  retryAt: number
}
export const INITIAL_CLOUD: CloudView = {
  scope: null,
  ready: false,
  locked: true,
  mount: 0,
  status: "loading",
  raw: null,
  remote: null,
  revision: "0",
  retryAt: 0,
}
export interface CloudEnvironment {
  storage: CloudStorage
  guest: { read(): string; write(raw: string): void }
  request<T>(owner: string, path: string, options?: RequestInit): Promise<T>
  pause(): Promise<boolean>
  uuid(): string
  now(): number
  online(): boolean
  schedule(work: () => void, ms: number): () => void
  post(owner: string, version: string): void
  lock<T>(owner: string, work: () => Promise<T>): Promise<T>
}
function compatible(raw: string | null) {
  if (raw === null) return false
  try {
    parseSave(raw)
    return true
  } catch {
    return false
  }
}
function snapshot(value: CloudSnapshot): CloudSnapshot {
  if (
    !value ||
    typeof value.revision !== "string" ||
    !/^(0|[1-9][0-9]{0,18})$/.test(value.revision) ||
    BigInt(value.revision) > BigInt("9223372036854775807")
  )
    throw new ApiError("unavailable")
  if (
    value.revision === "0"
      ? value.payload !== null
      : !value.payload ||
        typeof value.payload !== "object" ||
        Array.isArray(value.payload) ||
        !Number.isInteger(value.schema)
  )
    throw new ApiError("unavailable")
  return value
}

export class CloudCoordinator {
  private state = INITIAL_CLOUD
  private listeners = new Set<() => void>()
  private authenticated = false
  private epoch = 0
  private transition = 0
  private stopTimer = () => {}
  private flights = new Map<string, Promise<void>>()
  private target: { owner: string; authenticated: boolean } | null = null
  private allowLocal = false
  constructor(private readonly env: CloudEnvironment) {}
  snapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private emit(patch: Partial<CloudView>) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((fn) => fn())
  }
  private current(owner: string, epoch: number) {
    return this.state.scope === owner && this.epoch === epoch
  }
  private display(record: AccountSave, status?: CloudStatus) {
    const incompatible =
      (record.raw !== null && !compatible(record.raw)) || record.conflict?.compatibility === "incompatible"
    const next =
      status ??
      (incompatible
        ? "incompatible"
        : record.conflict
          ? "conflict"
          : record.rejected
            ? "rejected"
            : record.pending || !sameSave(record.raw, record.base)
              ? "pending"
              : "saved")
    this.emit({
      raw: record.raw,
      revision: record.revision,
      remote: record.conflict,
      retryAt: record.retryAt,
      status: next,
      ready: compatible(record.raw),
      locked:
        ["peer", "review", "storage"].includes(next) ||
        (!this.allowLocal && ["conflict", "incompatible"].includes(next)) ||
        !!record.pending?.replace,
    })
  }
  async identity(owner: string, authenticated: boolean, approved = false) {
    if (owner === this.state.scope && !this.target) {
      const changed = this.authenticated !== authenticated
      this.authenticated = authenticated
      if (changed && !authenticated) {
        const epoch = this.epoch
        await this.env.pause()
        if (!this.current(owner, epoch)) return
        this.stopTimer()
        this.emit({ status: "auth", locked: true })
      }
      if (changed && authenticated) await this.reconcile()
      return
    }
    this.authenticated = false
    this.stopTimer()
    if (this.state.scope !== null && !approved) {
      this.transition++
      const target = { owner, authenticated }
      this.target = target
      await this.env.pause()
      if (this.target !== target) return
      this.emit({ status: "review", locked: true })
      return
    }
    await this.activate(owner, authenticated)
  }
  async acceptIdentity() {
    if (!this.target) return
    const target = this.target
    this.target = null
    this.allowLocal = false
    await this.activate(target.owner, target.authenticated)
  }
  private async activate(owner: string, authenticated: boolean) {
    const transition = ++this.transition
    if (!(await this.env.pause())) {
      this.emit({ status: "storage", locked: true })
      return
    }
    if (transition !== this.transition) return
    const epoch = ++this.epoch
    this.authenticated = authenticated
    this.target = null
    this.allowLocal = false
    this.emit({ ...INITIAL_CLOUD, scope: owner, mount: this.state.mount + 1 })
    try {
      if (owner === "guest") {
        const raw = this.env.guest.read()
        if (!this.current(owner, epoch)) return
        // Preserve the existing Guest recovery/unsaved-play UI; its SaveController
        // refuses writes until the original snapshot can be read successfully.
        this.emit({ raw, ready: true, locked: false, status: compatible(raw) ? "guest" : "incompatible" })
      } else {
        const record = await this.env.storage.read(owner)
        if (!this.current(owner, epoch)) return
        if (authenticated) await this.reconcile(true)
        else if (record) {
          this.display(record, "auth")
          this.emit({ locked: true })
        } else this.emit({ status: "auth", locked: true })
      }
    } catch {
      if (this.current(owner, epoch))
        this.emit({ status: "storage", locked: owner !== "guest", ready: owner === "guest" })
    }
  }
  attach(): { port: SavePort; close(): void } {
    const owner = this.state.scope,
      epoch = this.epoch
    let version = "",
      closed = false,
      staleRaw = ""
    const valid = () => !closed && !!owner && this.current(owner, epoch)
    return {
      port: {
        flush: async () => {
          if (valid()) await this.flush()
        },
        load: async () => {
          if (!valid()) throw new Error("scope")
          if (owner === "guest") return parseSave(this.env.guest.read())
          const record = await this.env.storage.read(owner!)
          if (!valid() || !record?.raw) throw new Error("storage")
          version = record.version
          return parseSave(record.raw)
        },
        save: async (save: GameSave) => {
          if (!valid()) return false
          const raw = JSON.stringify(save)
          try {
            if (owner === "guest") {
              this.env.guest.write(raw)
              if (valid()) this.emit({ raw, status: "guest" })
              return true
            }
            let accepted = false
            let backedUp = false
            const record = await this.env.storage.change(owner!, (record, backup) => {
              if (!valid()) return record
              if (record.version !== version || record.pending?.replace) {
                if (staleRaw !== raw) {
                  backup(raw, "stale-tab")
                  backedUp = true
                }
                return record
              }
              accepted = true
              if (sameSave(record.raw, raw)) return record
              return { ...record, raw, version: this.env.uuid(), rejected: false }
            })
            if (backedUp) staleRaw = raw
            if (!valid()) return accepted
            if (!accepted) {
              const pause = this.state.status !== "peer"
              this.emit({ status: "peer", locked: true })
              if (pause) void this.env.pause()
              return false
            }
            version = record.version
            this.display(record, !this.authenticated ? "auth" : undefined)
            this.env.post(owner!, record.version)
            this.schedule()
            return true // Local durable only; cloud acknowledgement is a separate state.
          } catch {
            if (valid()) this.emit({ status: "storage", locked: owner !== "guest" })
            return false
          }
        },
      },
      close() {
        closed = true
      },
    }
  }
  private schedule(delay = 2000) {
    this.stopTimer()
    if (!this.authenticated || this.state.scope === "guest" || this.target) return
    this.stopTimer = this.env.schedule(
      () => {
        void this.flush()
      },
      Math.max(delay, this.state.retryAt - this.env.now()),
    )
  }
  async flush(): Promise<void> {
    const owner = this.state.scope,
      epoch = this.epoch
    if (!owner || owner === "guest" || !this.authenticated || this.target) return
    const existing = this.flights.get(owner)
    if (existing) return existing
    const work = this.env
      .lock(owner, async () => {
        if (!this.current(owner, epoch) || !this.authenticated || !this.env.online()) {
          if (this.current(owner, epoch)) this.emit({ status: "offline" })
          return
        }
        try {
          let record = await this.env.storage.read(owner)
          if (!record || record.conflict || record.rejected || !compatible(record.raw)) return
          if (record.retryAt > this.env.now()) {
            this.display(record, "pending")
            this.schedule()
            return
          }
          record = await this.env.storage.change(owner, (record) => {
            if (record.pending || sameSave(record.raw, record.base) || record.conflict || record.rejected)
              return record
            return {
              ...record,
              pending: {
                body: {
                  expectedRevision: record.revision,
                  mutationId: this.env.uuid(),
                  schema: 4,
                  payload: parseSave(record.raw!),
                },
                raw: record.raw!,
              },
            }
          })
          if (!record.pending || !this.current(owner, epoch) || !this.authenticated) return
          const pending = record.pending
          this.emit({ status: "syncing" })
          const receipt = await this.env.request<{ revision: string; mutationId: string }>(
            owner,
            pending.body.choice ? "/city-bloxx/save/resolve" : "/city-bloxx/save",
            { method: pending.body.choice ? "POST" : "PUT", body: JSON.stringify(pending.body) },
          )
          if (!this.current(owner, epoch) || !this.authenticated) return
          if (
            receipt.mutationId !== pending.body.mutationId ||
            !/^[1-9][0-9]{0,18}$/.test(receipt.revision) ||
            BigInt(receipt.revision) > BigInt("9223372036854775807")
          )
            throw new ApiError("unavailable")
          let replaced = false
          record = await this.env.storage.change(owner, (record) => {
            if (record.pending?.body.mutationId !== pending.body.mutationId) return record
            replaced = !!pending.replace && record.version === pending.version
            return {
              ...record,
              ...(replaced ? { raw: pending.raw, version: this.env.uuid() } : {}),
              base: pending.raw,
              revision: receipt.revision,
              pending: null,
              conflict: null,
              retryAt: 0,
              rejected: false,
            }
          })
          if (!this.current(owner, epoch)) return
          this.display(record)
          if (replaced) {
            this.epoch++
            this.emit({ mount: this.state.mount + 1 })
          }
          this.env.post(owner, record.version)
          if (!sameSave(record.raw, record.base)) this.schedule()
        } catch (error) {
          await this.failure(owner, epoch, error)
        }
      })
      .catch((error) => this.failure(owner, epoch, error instanceof ApiError ? error : new ApiError("unavailable",503)))
      .finally(() => {
        if (this.flights.get(owner) === work) this.flights.delete(owner)
      })
    this.flights.set(owner, work)
    return work
  }
  private async failure(owner: string, epoch: number, error: unknown) {
    if (!this.current(owner, epoch)) return
    try {
      if (error instanceof ApiError && error.status === 409) {
        const cloud = snapshot(await this.env.request<CloudSnapshot>(owner, "/city-bloxx/save"))
        if (!this.current(owner, epoch)) return
        let record = await this.env.storage.change(owner, (record) => ({ ...record, conflict: cloud }))
        await this.env.pause()
        record = (await this.env.storage.read(owner)) ?? record
        if (!this.current(owner, epoch)) return
        this.display(record)
      } else if (error instanceof ApiError) {
        const terminal = [400, 413, 422].includes(error.status)
        const record = await this.env.storage.change(owner, (record, backup) => {
          if (terminal && record.pending) backup(JSON.stringify(record.pending), "rejected-mutation")
          return {
            ...record,
            conflict: terminal ? (record.pending?.remote ?? record.conflict) : record.conflict,
            pending: terminal ? null : record.pending,
            rejected: terminal,
            retryAt: this.env.now() + Math.max(1, error.retryAfter ?? (error.status === 429 ? 60 : 5)) * 1000,
          }
        })
        if (!this.current(owner, epoch)) return
        this.display(
          record,
          terminal
            ? "rejected"
            : [401, 403].includes(error.status) || error.issue === "account-changed"
              ? "auth"
              : "offline",
        )
        if (!terminal && ![401, 403].includes(error.status) && error.issue !== "account-changed")
          this.schedule(5000)
      } else this.emit({ status: "storage", locked: true })
    } catch {
      if (this.current(owner, epoch)) {
        this.emit({ status: "offline" })
        this.schedule(5000)
      }
    }
  }
  async reconcile(initial = false) {
    const owner = this.state.scope,
      epoch = this.epoch
    if (!owner || owner === "guest" || !this.authenticated || this.target) return
    try {
      let record = await this.env.storage.read(owner)
      if (record?.pending && !record.conflict && !record.rejected) {
        await this.flush()
        record = await this.env.storage.read(owner)
        if (record?.pending) {
          if (initial && this.current(owner, epoch)) this.display(record, this.state.status)
          return
        }
      }
      const cloud = snapshot(await this.env.request<CloudSnapshot>(owner, "/city-bloxx/save"))
      if (!this.current(owner, epoch) || !this.authenticated) return
      const cloudRaw = cloud.payload === null ? null : JSON.stringify(cloud.payload)
      record = await this.env.storage.change(owner, (record, backup) => {
        if (record.pending) return record
        if (record.raw === null && cloudRaw === null)
          return { ...record, raw: JSON.stringify(emptySave()), version: this.env.uuid() }
        if (
          record.raw === null ||
          (initial &&
            sameSave(record.raw, record.base) &&
            !record.conflict &&
            compatible(cloudRaw) &&
            (cloud.revision !== record.revision || !sameSave(cloudRaw, record.base)))
        ) {
          if (record.raw) backup(record.raw, "before-cloud-download")
          if (cloudRaw) backup(cloudRaw, "cloud-download")
          return {
            ...record,
            raw: cloudRaw,
            base: cloudRaw,
            revision: cloud.revision,
            version: this.env.uuid(),
            conflict: compatible(cloudRaw) ? null : cloud,
          }
        }
        if (cloud.revision !== record.revision || !sameSave(cloudRaw, record.base)) {
          // Identical snapshots need no merge or active-state replacement.
          if (sameSave(record.raw, cloudRaw))
            return { ...record, base: cloudRaw, revision: cloud.revision, conflict: null }
          return { ...record, conflict: cloud }
        }
        return record
      })
      if (!this.current(owner, epoch)) return
      this.display(record)
      if (record.conflict) await this.env.pause()
      else this.schedule()
    } catch (error) {
      if (!this.current(owner, epoch)) return
      const cached = await this.env.storage.read(owner).catch(() => null)
      if (!this.current(owner, epoch)) return
      if (cached?.raw)
        this.display(
          cached,
          error instanceof ApiError && [401, 403].includes(error.status) ? "auth" : "offline",
        )
      else this.emit({ status: error instanceof ApiError ? "offline" : "storage", locked: true })
    }
  }
  async choose(choice: "local" | "cloud") {
    const owner = this.state.scope,
      epoch = this.epoch
    if (!owner || owner === "guest" || !this.authenticated || !(await this.env.pause()))
      throw new Error("storage")
    const record = await this.env.storage.change(owner, (record, backup) => {
      if (!this.current(owner, epoch) || !this.authenticated) throw new Error("scope")
      if (!record.conflict || !record.raw) throw new Error("conflict")
      const cloud = record.conflict,
        cloudRaw = JSON.stringify(cloud.payload)
      const selected = choice === "cloud" ? cloudRaw : record.raw
      parseSave(selected)
      if (cloud.compatibility === "incompatible") throw new Error("incompatible")
      backup(record.raw, "resolve-local")
      backup(cloudRaw, "resolve-cloud")
      if (record.pending) backup(JSON.stringify(record.pending), "resolve-pending")
      const body: Mutation =
        cloud.revision === "0"
          ? { expectedRevision: "0", mutationId: this.env.uuid(), schema: 4, payload: parseSave(selected) }
          : {
              expectedRevision: cloud.revision,
              mutationId: this.env.uuid(),
              choice,
              local: { schema: JSON.parse(record.raw).schema, rawPayload: record.raw },
              localBackupAcknowledged: true,
            }
      return {
        ...record,
        conflict: null,
        rejected: false,
        retryAt: 0,
        pending: {
          body,
          raw: JSON.stringify(parseSave(selected)),
          replace: true,
          version: record.version,
          remote: cloud,
        },
      }
    })
    if (!this.current(owner, epoch)) return
    this.display(record, "pending")
    await this.flush()
  }
  async importGuest() {
    const owner = this.state.scope,
      epoch = this.epoch
    if (!owner || owner === "guest" || !(await this.env.pause())) throw new Error("storage")
    const raw = this.env.guest.read(),
      normalized = JSON.stringify(parseSave(raw))
    const record = await this.env.storage.change(owner, (record, backup) => {
      if (!this.current(owner, epoch) || record.pending?.replace) throw new Error("scope")
      backup(raw, "guest-import")
      if (record.raw) backup(record.raw, "before-guest-import")
      return { ...record, raw: normalized, version: this.env.uuid(), rejected: false }
    })
    if (!this.current(owner, epoch)) return
    this.display(record)
    this.epoch++
    this.emit({ mount: this.state.mount + 1 })
    this.env.post(owner, record.version)
    this.schedule()
  }
  async peer(owner: string, version: string) {
    if (owner !== this.state.scope || owner === "guest" || this.target) return
    const epoch = this.epoch,
      record = await this.env.storage.read(owner)
    if (!record || !this.current(owner, epoch)) return
    if (version && record.version === version) {
      // Compare the on-screen snapshot, not the shared store's latest version alone.
      if (!sameSave(this.state.raw, record.raw)) {
        await this.env.pause()
        if (this.current(owner, epoch)) this.emit({ status: "peer", locked: true })
        return
      }
    }
    this.display(record)
  }
  async reloadLocal() {
    const owner = this.state.scope,
      epoch = this.epoch
    if (!owner || !(await this.env.pause())) throw new Error("storage")
    if (!this.current(owner, epoch)) return
    if (owner === "guest") {
      await this.activate(owner, false)
      return
    }
    const record = await this.env.storage.read(owner)
    if (!this.current(owner, epoch)) return
    if (!record) throw new Error("storage")
    this.display(record)
    this.epoch++
    this.emit({ mount: this.state.mount + 1 })
  }
  continueLocal() {
    if (this.state.ready) {
      this.allowLocal = true
      this.emit({ locked: false })
    }
  }
  backups() {
    const owner = this.state.scope
    return owner && owner !== "guest" ? this.env.storage.backups(owner) : Promise.resolve([])
  }
  async retry() {
    const owner = this.state.scope
    if (!owner) return
    if (!this.state.ready) {
      await this.activate(owner, this.authenticated)
      return
    }
    if (owner === "guest") return
    await this.env.storage.change(owner, (record) => ({ ...record, rejected: false }))
    await this.flush()
    await this.reconcile()
  }
  dispose() {
    this.epoch++
    this.stopTimer()
    this.listeners.clear()
  }
}
