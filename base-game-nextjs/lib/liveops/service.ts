import {
  BUNDLED_LIVEOPS_MANIFEST,
  validateLiveOpsManifest,
  type LiveOpsKillSwitch,
  type LiveOpsManifest,
} from "../../../packages/city-bloxx-core/src/index"

export const LIVEOPS_CACHE_STORAGE_KEY = "city-bloxx:liveops:cache:v1"
export const LIVEOPS_DEFAULT_TTL_SECONDS = 900

export interface LiveOpsAuditEntry {
  id: string
  action: "publish" | "rollback" | "kill-switch"
  revision: string
  previousRevision: string
  actor: string
  reason: string
  timestampUTC: string
}

export interface ActiveContentResponse {
  status: "ok"
  revision: string
  publishedAtUTC: string
  ttlSeconds: number
  catalogIds: {
    weeklyVersion: "weekly-contracts-1"
    winterEventId: string
    freeSeasonId: string
  }
  manifest: LiveOpsManifest
}

function containsExecutablePayload(value: unknown): boolean {
  if (typeof value === "string") {
    const lower = value.toLowerCase()
    return (
      lower.includes("<script") ||
      lower.includes("javascript:") ||
      lower.includes("onerror=") ||
      lower.includes("onload=") ||
      lower.includes("eval(") ||
      lower.includes("function(")
    )
  }
  if (Array.isArray(value)) return value.some(containsExecutablePayload)
  if (value && typeof value === "object") {
    return Object.entries(value).some(([k, v]) => containsExecutablePayload(k) || containsExecutablePayload(v))
  }
  return false
}

export class LiveOpsConfigService {
  private readonly revisions = new Map<string, LiveOpsManifest>()
  private activeRevision: string
  private readonly auditLog: LiveOpsAuditEntry[] = []

  constructor(initialManifest: LiveOpsManifest = BUNDLED_LIVEOPS_MANIFEST) {
    const validated = validateLiveOpsManifest(initialManifest)
    this.revisions.set(validated.revision, Object.freeze(validated))
    this.activeRevision = validated.revision
  }

  getActiveManifest(): LiveOpsManifest {
    const current = this.revisions.get(this.activeRevision) ?? BUNDLED_LIVEOPS_MANIFEST
    return JSON.parse(JSON.stringify(current))
  }

  getActiveContentResponse(): ActiveContentResponse {
    const manifest = this.getActiveManifest()
    return {
      status: "ok",
      revision: manifest.revision,
      publishedAtUTC: manifest.publishedAtUTC,
      ttlSeconds: manifest.ttlSeconds,
      catalogIds: {
        weeklyVersion: "weekly-contracts-1",
        winterEventId: manifest.winterEvent.id,
        freeSeasonId: manifest.freeSeason.id,
      },
      manifest,
    }
  }

  getCacheHeaders(): Record<string, string> {
    const manifest = this.getActiveManifest()
    return {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${manifest.ttlSeconds}, stale-while-revalidate=60`,
      "X-Content-Type-Options": "nosniff",
      "X-LiveOps-Revision": manifest.revision,
    }
  }

  listRevisions(): string[] {
    return [...this.revisions.keys()]
  }

  getAuditLog(): LiveOpsAuditEntry[] {
    return this.auditLog.map((entry) => ({ ...entry }))
  }

  publishRevision(
    candidate: unknown,
    actor: string,
    reason: string,
    nowISO = new Date().toISOString(),
  ): LiveOpsManifest {
    if (!actor || typeof actor !== "string" || !actor.trim()) {
      throw new Error("Admin actor is required for LiveOps publish")
    }
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      throw new Error("Audit reason is required for LiveOps publish")
    }
    if (containsExecutablePayload(candidate)) {
      throw new Error("Executable or script payload is forbidden in LiveOps config")
    }
    const validated = validateLiveOpsManifest(candidate)
    if (this.revisions.has(validated.revision)) {
      throw new Error(`LiveOps revision ${validated.revision} is immutable and already exists`)
    }
    const previousRevision = this.activeRevision
    this.revisions.set(validated.revision, Object.freeze(validated))
    this.activeRevision = validated.revision
    this.auditLog.push({
      id: `audit-${this.auditLog.length + 1}-${validated.revision}`,
      action: "publish",
      revision: validated.revision,
      previousRevision,
      actor: actor.trim(),
      reason: reason.trim(),
      timestampUTC: nowISO,
    })
    return this.getActiveManifest()
  }

  rollbackToRevision(
    targetRevision: string,
    actor: string,
    reason: string,
    nowISO = new Date().toISOString(),
  ): LiveOpsManifest {
    if (!actor || typeof actor !== "string" || !actor.trim()) {
      throw new Error("Admin actor is required for LiveOps rollback")
    }
    if (!reason || typeof reason !== "string" || !reason.trim()) {
      throw new Error("Audit reason is required for LiveOps rollback")
    }
    const target = this.revisions.get(targetRevision)
    if (!target) {
      throw new Error(`Target LiveOps revision ${targetRevision} does not exist`)
    }
    const validated = validateLiveOpsManifest(target)
    const previousRevision = this.activeRevision
    this.activeRevision = validated.revision
    this.auditLog.push({
      id: `audit-${this.auditLog.length + 1}-${validated.revision}`,
      action: "rollback",
      revision: validated.revision,
      previousRevision,
      actor: actor.trim(),
      reason: reason.trim(),
      timestampUTC: nowISO,
    })
    return this.getActiveManifest()
  }

  updateKillSwitch(
    patch: Partial<LiveOpsKillSwitch>,
    actor: string,
    reason: string,
    nextRevisionId?: string,
    nowISO = new Date().toISOString(),
  ): LiveOpsManifest {
    const current = this.getActiveManifest()
    const revision = nextRevisionId ?? `${current.revision}-ks-${this.auditLog.length + 1}`
    const nextManifest: LiveOpsManifest = {
      ...current,
      revision,
      publishedAtUTC: nowISO,
      killSwitch: {
        ...current.killSwitch,
        ...patch,
      },
    }
    const validated = validateLiveOpsManifest(nextManifest)
    if (this.revisions.has(validated.revision)) {
      throw new Error(`LiveOps revision ${validated.revision} is immutable and already exists`)
    }
    const previousRevision = this.activeRevision
    this.revisions.set(validated.revision, Object.freeze(validated))
    this.activeRevision = validated.revision
    this.auditLog.push({
      id: `audit-${this.auditLog.length + 1}-${validated.revision}`,
      action: "kill-switch",
      revision: validated.revision,
      previousRevision,
      actor: actor.trim(),
      reason: reason.trim(),
      timestampUTC: nowISO,
    })
    return this.getActiveManifest()
  }
}

let defaultService: LiveOpsConfigService | null = null

export function getLiveOpsConfigService(): LiveOpsConfigService {
  if (!defaultService) {
    defaultService = new LiveOpsConfigService(BUNDLED_LIVEOPS_MANIFEST)
  }
  return defaultService
}

export interface CachedLiveOpsEnvelope {
  fetchedAtMs: number
  manifest: LiveOpsManifest
}

export function readCachedLiveOpsManifest(
  storage: Pick<Storage, "getItem"> | null | undefined,
  nowMs = Date.now(),
): { manifest: LiveOpsManifest; fresh: boolean } | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(LIVEOPS_CACHE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedLiveOpsEnvelope
    if (!parsed || typeof parsed.fetchedAtMs !== "number") return null
    const manifest = validateLiveOpsManifest(parsed.manifest)
    const ageMs = Math.max(0, nowMs - parsed.fetchedAtMs)
    const fresh = ageMs <= manifest.ttlSeconds * 1000
    return { manifest, fresh }
  } catch {
    return null
  }
}

export function writeCachedLiveOpsManifest(
  storage: Pick<Storage, "setItem"> | null | undefined,
  manifest: LiveOpsManifest,
  nowMs = Date.now(),
): void {
  if (!storage) return
  try {
    const validated = validateLiveOpsManifest(manifest)
    const envelope: CachedLiveOpsEnvelope = {
      fetchedAtMs: nowMs,
      manifest: validated,
    }
    storage.setItem(LIVEOPS_CACHE_STORAGE_KEY, JSON.stringify(envelope))
  } catch {
    // Ignore quota or private browsing errors
  }
}

export async function resolveWebLiveOpsManifest(options?: {
  storage?: Pick<Storage, "getItem" | "setItem"> | null
  fetchFn?: typeof fetch
  nowMs?: number
  endpoint?: string
}): Promise<{ manifest: LiveOpsManifest; source: "cache" | "network" | "last-good" | "bundled" }> {
  const storage = options?.storage ?? (typeof window !== "undefined" ? window.localStorage : null)
  const nowMs = options?.nowMs ?? Date.now()
  const cached = readCachedLiveOpsManifest(storage, nowMs)
  if (cached?.fresh) {
    return { manifest: cached.manifest, source: "cache" }
  }

  const fetchImpl = options?.fetchFn ?? (typeof fetch !== "undefined" ? fetch : undefined)
  if (fetchImpl) {
    try {
      const response = await fetchImpl(options?.endpoint ?? "/content/active", {
        method: "GET",
        headers: { Accept: "application/json" },
      })
      if (response.ok) {
        const body = (await response.json()) as Partial<ActiveContentResponse> & { manifest?: unknown }
        const rawManifest = body?.manifest ?? body
        if (!containsExecutablePayload(rawManifest)) {
          const validated = validateLiveOpsManifest(rawManifest)
          writeCachedLiveOpsManifest(storage, validated, nowMs)
          return { manifest: validated, source: "network" }
        }
      }
    } catch {
      // Network failure falls back to last-good or bundled
    }
  }

  if (cached?.manifest) {
    return { manifest: cached.manifest, source: "last-good" }
  }

  return { manifest: BUNDLED_LIVEOPS_MANIFEST, source: "bundled" }
}
