import {
  PHYSICS_VERSION,
  RULESET_VERSION,
  verifyRecord,
  type BuildingId,
  type DailyDefinition,
  type GameSave,
  type RunRecord,
  type RunResult,
  type SkylineSnapshot,
} from "../../../packages/city-bloxx-core/src/index";
import {
  renderShareCardPng,
  truncateShareDisplayName,
  SHARE_CARD_WIDTH,
  SHARE_CARD_HEIGHT,
  type ShareCardInput,
  type ShareCardRenderOutput,
} from "./share-card";

export {
  renderShareCardPng,
  truncateShareDisplayName,
  SHARE_CARD_WIDTH,
  SHARE_CARD_HEIGHT,
  type ShareCardInput,
  type ShareCardRenderOutput,
};

export const DISPLAY_NAME_MIN_LENGTH = 3;
export const DISPLAY_NAME_MAX_LENGTH = 24;
export const REPLAY_DOWNLOAD_RATE_LIMIT = 10;
export const REPLAY_DOWNLOAD_WINDOW_MS = 60_000;
export const CHALLENGE_TICKET_TTL_MS = 30 * 60_000;

const MODERATION_BLOCKLIST = [
  "admin",
  "administrator",
  "moderator",
  "sysadmin",
  "support",
  "official",
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "cunt",
  "dick",
  "nazi",
  "hitler",
  "scam",
  "http://",
  "https://",
  "www.",
  "@",
];

export interface DisplayNameValidation {
  valid: boolean;
  normalized: string;
  reason?: "too-short" | "too-long" | "invalid-characters" | "moderated";
}

export function defaultPlayerHandle(playerId: string): string {
  let hash = 2166136261;
  for (let i = 0; i < playerId.length; i++) {
    hash ^= playerId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const code = ((hash >>> 0) % 9000 + 1000).toString(10);
  return `Architect-${code}`;
}

export function validateDisplayName(raw: string): DisplayNameValidation {
  if (typeof raw !== "string") {
    return { valid: false, normalized: "", reason: "too-short" };
  }
  const normalized = raw.trim().replace(/\s+/g, " ");
  if (normalized.length < DISPLAY_NAME_MIN_LENGTH) {
    return { valid: false, normalized, reason: "too-short" };
  }
  if (normalized.length > DISPLAY_NAME_MAX_LENGTH) {
    return { valid: false, normalized, reason: "too-long" };
  }
  if (!/^[\p{L}\p{N} _.-]+$/u.test(normalized)) {
    return { valid: false, normalized, reason: "invalid-characters" };
  }
  const lower = normalized.toLowerCase();
  for (const blocked of MODERATION_BLOCKLIST) {
    if (lower.includes(blocked)) {
      return { valid: false, normalized, reason: "moderated" };
    }
  }
  return { valid: true, normalized };
}

export interface StoredPlayerProfile {
  playerId: string;
  handle: string;
  displayName: string;
  publicOptIn: boolean;
  disabledByModeration: boolean;
  email?: string;
  cloudPayload?: unknown;
  deviceMetadata?: unknown;
  joinedAt: number;
}

export interface PublicPlayerProfile {
  playerId: string;
  handle: string;
  displayName: string;
  joinedAt: number;
  publishedTowers: PublicTowerView[];
}

export interface StoredPublishedTower {
  id: string;
  ownerId: string;
  runId: string;
  kind: "quick" | "daily" | "skyline-album";
  competitiveEligible: boolean;
  seed: number;
  building: BuildingId;
  daily?: DailyDefinition;
  physicsVersion: string;
  rulesetVersion: string;
  verifiedResult: RunResult;
  sanitizedRecord: RunRecord | null;
  albumSnapshot?: SkylineSnapshot;
  publishedAt: number;
  revokedAt: number | null;
  disabledByModeration: boolean;
  privateMetadata?: {
    email?: string;
    ip?: string;
    userAgent?: string;
    installationId?: string;
    cloudSave?: unknown;
  };
}

export interface PublicTowerView {
  id: string;
  ownerId: string;
  ownerDisplayName: string;
  ownerHandle: string;
  kind: "quick" | "daily" | "skyline-album";
  competitiveEligible: boolean;
  building: BuildingId;
  dateUTC: string | null;
  physicsVersion: string;
  rulesetVersion: string;
  result: RunResult;
  publishedAt: number;
  replayAvailable: boolean;
  challengeId: string | null;
}

export interface StoredChallenge {
  id: string;
  towerId: string;
  ownerId: string;
  mode: "quick" | "daily";
  seed: number;
  building: BuildingId;
  daily?: DailyDefinition;
  physicsVersion: string;
  rulesetVersion: string;
  targetResult: RunResult;
  createdAt: number;
  revokedAt: number | null;
  disabledByModeration: boolean;
  attempts: ChallengeAttemptOutcome[];
}

export interface ChallengeTicket {
  ticketId: string;
  challengeId: string;
  challengerId: string;
  mode: "quick" | "daily";
  seed: number;
  building: BuildingId;
  daily?: DailyDefinition;
  physicsVersion: string;
  rulesetVersion: string;
  issuedAt: number;
  expiresAt: number;
  used: boolean;
}

export interface ChallengeAttemptOutcome {
  ticketId: string;
  challengeId: string;
  challengerId: string;
  challengerResult: RunResult;
  targetResult: RunResult;
  winner: "challenger" | "creator" | "tie";
  completedAt: number;
}

export interface PublicChallengeView {
  id: string;
  towerId: string;
  ownerId: string;
  ownerDisplayName: string;
  mode: "quick" | "daily";
  building: BuildingId;
  dateUTC: string | null;
  physicsVersion: string;
  rulesetVersion: string;
  versionCompatible: boolean;
  targetResult: RunResult;
  attemptsCount: number;
  challengerWins: number;
}

export interface ModerationReport {
  id: string;
  reporterId: string;
  targetType: "tower" | "player" | "challenge";
  targetId: string;
  reason: string;
  createdAt: number;
}

export interface SocialStore {
  players: Map<string, StoredPlayerProfile>;
  towers: Map<string, StoredPublishedTower>;
  challenges: Map<string, StoredChallenge>;
  tickets: Map<string, ChallengeTicket>;
  reports: ModerationReport[];
  rateLimits: Map<string, number[]>;
  nextSeq: number;
}

export function createSocialStore(): SocialStore {
  return {
    players: new Map(),
    towers: new Map(),
    challenges: new Map(),
    tickets: new Map(),
    reports: [],
    rateLimits: new Map(),
    nextSeq: 1,
  };
}

export function upsertPlayerProfile(
  store: SocialStore,
  input: {
    playerId: string;
    displayName?: string;
    publicOptIn?: boolean;
    email?: string;
    cloudPayload?: unknown;
    deviceMetadata?: unknown;
    now?: number;
  },
): { ok: true; profile: StoredPlayerProfile } | { ok: false; code: string; reason?: string } {
  if (!input.playerId || typeof input.playerId !== "string") {
    return { ok: false, code: "UNAUTHORIZED" };
  }
  const existing = store.players.get(input.playerId);
  const handle = existing?.handle ?? defaultPlayerHandle(input.playerId);
  let displayName = existing?.displayName ?? handle;
  if (input.displayName !== undefined) {
    const check = validateDisplayName(input.displayName);
    if (!check.valid) {
      return { ok: false, code: "INVALID_DISPLAY_NAME", reason: check.reason };
    }
    displayName = check.normalized;
  }
  const profile: StoredPlayerProfile = {
    playerId: input.playerId,
    handle,
    displayName,
    publicOptIn: input.publicOptIn ?? existing?.publicOptIn ?? false,
    disabledByModeration: existing?.disabledByModeration ?? false,
    email: input.email ?? existing?.email,
    cloudPayload: input.cloudPayload ?? existing?.cloudPayload,
    deviceMetadata: input.deviceMetadata ?? existing?.deviceMetadata,
    joinedAt: existing?.joinedAt ?? input.now ?? 0,
  };
  store.players.set(input.playerId, profile);
  return { ok: true, profile };
}

function sanitizeRecordForPublic(record: RunRecord, verifiedResult: RunResult): RunRecord {
  return {
    schema: 1,
    physicsVersion: record.physicsVersion,
    rulesetVersion: record.rulesetVersion,
    config: {
      seed: record.config.seed,
      mode: record.config.mode,
      assist: false,
      ...(record.config.building ? { building: record.config.building } : {}),
      ...(record.config.daily ? { daily: { ...record.config.daily } } : {}),
    },
    endTick: record.endTick,
    inputs: record.inputs.map(inp => ({
      tick: inp.tick,
      sequence: inp.sequence,
      fraction: inp.fraction,
    })),
    result: { ...verifiedResult },
  };
}

export function publishTower(
  store: SocialStore,
  req: {
    ownerId: string | null;
    runId: string;
    record?: RunRecord;
    albumSnapshot?: SkylineSnapshot;
    now?: number;
    privateMetadata?: StoredPublishedTower["privateMetadata"];
  },
): { ok: true; tower: PublicTowerView; challengeId: string | null } | { ok: false; status: number; code: string } {
  if (!req.ownerId) {
    return { ok: false, status: 401, code: "UNAUTHORIZED" };
  }
  if (!req.runId || typeof req.runId !== "string") {
    return { ok: false, status: 400, code: "INVALID_RUN_ID" };
  }
  // Ensure player profile exists
  if (!store.players.has(req.ownerId)) {
    upsertPlayerProfile(store, { playerId: req.ownerId, now: req.now ?? 0 });
  }
  const ownerProfile = store.players.get(req.ownerId)!;
  if (ownerProfile.disabledByModeration) {
    return { ok: false, status: 403, code: "ACCOUNT_RESTRICTED" };
  }

  // Idempotency check for active published tower of the same (ownerId, runId)
  for (const existing of store.towers.values()) {
    if (existing.ownerId === req.ownerId && existing.runId === req.runId && existing.revokedAt === null) {
      const view = toPublicTowerView(store, existing);
      return { ok: true, tower: view, challengeId: view.challengeId };
    }
  }

  if (req.albumSnapshot && !req.record) {
    // Non-competitive Skyline Album share card
    const towerId = `tower-${store.nextSeq++}`;
    const totalPop = req.albumSnapshot.lots.reduce((sum, lot) => sum + (lot?.population ?? 0), 0);
    const maxFloors = req.albumSnapshot.lots.reduce((max, lot) => Math.max(max, lot?.floors ?? 0), 0);
    const stored: StoredPublishedTower = {
      id: towerId,
      ownerId: req.ownerId,
      runId: req.runId,
      kind: "skyline-album",
      competitiveEligible: false,
      seed: 0,
      building: "residential",
      physicsVersion: PHYSICS_VERSION,
      rulesetVersion: RULESET_VERSION,
      verifiedResult: {
        height: maxFloors,
        population: totalPop,
        accuracy: 100,
        perfectCount: 0,
        bestStreak: 0,
        rating: "A",
        ratingVersion: "quick-rating-1",
        misses: 0,
        durationTicks: 0,
        ranked: false,
      },
      sanitizedRecord: null,
      albumSnapshot: req.albumSnapshot,
      publishedAt: req.now ?? 0,
      revokedAt: null,
      disabledByModeration: false,
      privateMetadata: req.privateMetadata,
    };
    store.towers.set(towerId, stored);
    const view = toPublicTowerView(store, stored);
    return { ok: true, tower: view, challengeId: null };
  }

  if (!req.record) {
    return { ok: false, status: 400, code: "MISSING_REPLAY" };
  }
  if (req.record.config.mode !== "quick" && req.record.config.mode !== "daily") {
    return { ok: false, status: 400, code: "UNSUPPORTED_COMPETITIVE_MODE" };
  }
  if (req.record.config.assist) {
    return { ok: false, status: 400, code: "ASSIST_NOT_ELIGIBLE" };
  }
  const expectedRuleset =
    req.record.config.mode === "daily"
      ? (req.record.config.daily?.rulesetVersion ?? "daily-tower-1")
      : RULESET_VERSION;
  if (
    req.record.physicsVersion !== PHYSICS_VERSION ||
    req.record.rulesetVersion !== expectedRuleset
  ) {
    return { ok: false, status: 400, code: "UNSUPPORTED_REPLAY_VERSION" };
  }

  let verified: { result: RunResult };
  try {
    verified = verifyRecord(req.record);
  } catch {
    return { ok: false, status: 400, code: "INVALID_REPLAY" };
  }
  if (
    verified.result.population !== req.record.result.population ||
    verified.result.height !== req.record.result.height ||
    verified.result.misses !== req.record.result.misses ||
    verified.result.durationTicks !== req.record.result.durationTicks
  ) {
    return { ok: false, status: 400, code: "TAMPERED_RESULT" };
  }

  const towerId = `tower-${store.nextSeq++}`;
  const challengeId = `challenge-${store.nextSeq++}`;
  const building: BuildingId = req.record.config.building ?? "residential";
  const sanitized = sanitizeRecordForPublic(req.record, verified.result);

  const storedTower: StoredPublishedTower = {
    id: towerId,
    ownerId: req.ownerId,
    runId: req.runId,
    kind: req.record.config.mode,
    competitiveEligible: true,
    seed: req.record.config.seed,
    building,
    daily: req.record.config.daily,
    physicsVersion: req.record.physicsVersion,
    rulesetVersion: req.record.rulesetVersion,
    verifiedResult: { ...verified.result },
    sanitizedRecord: sanitized,
    publishedAt: req.now ?? 0,
    revokedAt: null,
    disabledByModeration: false,
    privateMetadata: req.privateMetadata,
  };
  store.towers.set(towerId, storedTower);

  const storedChallenge: StoredChallenge = {
    id: challengeId,
    towerId,
    ownerId: req.ownerId,
    mode: req.record.config.mode,
    seed: req.record.config.seed,
    building,
    daily: req.record.config.daily,
    physicsVersion: req.record.physicsVersion,
    rulesetVersion: req.record.rulesetVersion,
    targetResult: { ...verified.result },
    createdAt: req.now ?? 0,
    revokedAt: null,
    disabledByModeration: false,
    attempts: [],
  };
  store.challenges.set(challengeId, storedChallenge);

  const view = toPublicTowerView(store, storedTower);
  return { ok: true, tower: view, challengeId };
}

export function revokeTower(
  store: SocialStore,
  req: { towerId: string; actorId: string | null; now?: number },
): { ok: true; revoked: boolean } | { ok: false; status: number; code: string } {
  if (!req.actorId) {
    return { ok: false, status: 401, code: "UNAUTHORIZED" };
  }
  const tower = store.towers.get(req.towerId);
  if (!tower) {
    return { ok: false, status: 404, code: "NOT_FOUND" };
  }
  if (tower.ownerId !== req.actorId) {
    return { ok: false, status: 403, code: "FORBIDDEN" };
  }
  if (tower.revokedAt !== null) {
    return { ok: true, revoked: true };
  }
  const timestamp = req.now ?? 0;
  tower.revokedAt = timestamp;
  for (const ch of store.challenges.values()) {
    if (ch.towerId === tower.id && ch.revokedAt === null) {
      ch.revokedAt = timestamp;
    }
  }
  return { ok: true, revoked: true };
}

function toPublicTowerView(store: SocialStore, tower: StoredPublishedTower): PublicTowerView {
  const owner = store.players.get(tower.ownerId);
  const ownerHandle = owner?.handle ?? defaultPlayerHandle(tower.ownerId);
  const ownerDisplayName =
    owner && owner.publicOptIn && !owner.disabledByModeration ? owner.displayName : ownerHandle;
  let challengeId: string | null = null;
  for (const ch of store.challenges.values()) {
    if (ch.towerId === tower.id && ch.revokedAt === null && !ch.disabledByModeration) {
      challengeId = ch.id;
      break;
    }
  }
  return {
    id: tower.id,
    ownerId: tower.ownerId,
    ownerDisplayName,
    ownerHandle,
    kind: tower.kind,
    competitiveEligible: tower.competitiveEligible,
    building: tower.building,
    dateUTC: tower.daily?.dateUTC ?? null,
    physicsVersion: tower.physicsVersion,
    rulesetVersion: tower.rulesetVersion,
    result: { ...tower.verifiedResult },
    publishedAt: tower.publishedAt,
    replayAvailable: tower.sanitizedRecord !== null,
    challengeId,
  };
}

export function getPublicTower(store: SocialStore, towerId: string): PublicTowerView | null {
  const tower = store.towers.get(towerId);
  if (!tower || tower.revokedAt !== null || tower.disabledByModeration) return null;
  const owner = store.players.get(tower.ownerId);
  if (owner?.disabledByModeration) return null;
  return toPublicTowerView(store, tower);
}

export function getPublicProfile(store: SocialStore, playerId: string): PublicPlayerProfile | null {
  const profile = store.players.get(playerId);
  if (!profile || !profile.publicOptIn || profile.disabledByModeration) return null;
  const publishedTowers: PublicTowerView[] = [];
  for (const tower of store.towers.values()) {
    if (tower.ownerId === playerId && tower.revokedAt === null && !tower.disabledByModeration) {
      publishedTowers.push(toPublicTowerView(store, tower));
    }
  }
  return {
    playerId: profile.playerId,
    handle: profile.handle,
    displayName: profile.displayName,
    joinedAt: profile.joinedAt,
    publishedTowers,
  };
}

export function downloadPublicReplay(
  store: SocialStore,
  req: { towerId: string; clientKey: string; now?: number },
): { ok: true; record: RunRecord } | { ok: false; status: number; code: string } {
  const now = req.now ?? 0;
  const key = req.clientKey || "anonymous";
  const recent = (store.rateLimits.get(key) ?? []).filter(ts => now - ts < REPLAY_DOWNLOAD_WINDOW_MS);
  if (recent.length >= REPLAY_DOWNLOAD_RATE_LIMIT) {
    store.rateLimits.set(key, recent);
    return { ok: false, status: 429, code: "RATE_LIMITED" };
  }
  recent.push(now);
  store.rateLimits.set(key, recent);

  const tower = store.towers.get(req.towerId);
  if (!tower || tower.revokedAt !== null || tower.disabledByModeration || !tower.sanitizedRecord) {
    return { ok: false, status: 404, code: "NOT_FOUND" };
  }
  const owner = store.players.get(tower.ownerId);
  if (owner?.disabledByModeration) {
    return { ok: false, status: 404, code: "NOT_FOUND" };
  }
  return {
    ok: true,
    record: sanitizeRecordForPublic(tower.sanitizedRecord, tower.verifiedResult),
  };
}

export function reportPublicEntity(
  store: SocialStore,
  req: {
    reporterId: string;
    targetType: "tower" | "player" | "challenge";
    targetId: string;
    reason: string;
    now?: number;
  },
): { ok: true; reportId: string } | { ok: false; code: string } {
  if (!req.reporterId || !req.targetId || !req.reason?.trim()) {
    return { ok: false, code: "INVALID_REPORT" };
  }
  const reportId = `report-${store.nextSeq++}`;
  store.reports.push({
    id: reportId,
    reporterId: req.reporterId,
    targetType: req.targetType,
    targetId: req.targetId,
    reason: req.reason.trim().slice(0, 240),
    createdAt: req.now ?? 0,
  });
  return { ok: true, reportId };
}

export function moderateEntity(
  store: SocialStore,
  req: { targetType: "tower" | "player" | "challenge"; targetId: string; disable: boolean },
): boolean {
  if (req.targetType === "tower") {
    const tower = store.towers.get(req.targetId);
    if (!tower) return false;
    tower.disabledByModeration = req.disable;
    for (const ch of store.challenges.values()) {
      if (ch.towerId === tower.id) ch.disabledByModeration = req.disable;
    }
    return true;
  }
  if (req.targetType === "player") {
    const player = store.players.get(req.targetId);
    if (!player) return false;
    player.disabledByModeration = req.disable;
    return true;
  }
  const challenge = store.challenges.get(req.targetId);
  if (!challenge) return false;
  challenge.disabledByModeration = req.disable;
  return true;
}

function isChallengeVersionCompatible(ch: StoredChallenge): boolean {
  const expectedRuleset =
    ch.mode === "daily" ? (ch.daily?.rulesetVersion ?? "daily-tower-1") : RULESET_VERSION;
  return ch.physicsVersion === PHYSICS_VERSION && ch.rulesetVersion === expectedRuleset;
}

export function getPublicChallenge(store: SocialStore, challengeId: string): PublicChallengeView | null {
  const ch = store.challenges.get(challengeId);
  if (!ch || ch.revokedAt !== null || ch.disabledByModeration) return null;
  const tower = store.towers.get(ch.towerId);
  if (!tower || tower.revokedAt !== null || tower.disabledByModeration) return null;
  const owner = store.players.get(ch.ownerId);
  if (owner?.disabledByModeration) return null;
  const ownerHandle = owner?.handle ?? defaultPlayerHandle(ch.ownerId);
  const ownerDisplayName =
    owner && owner.publicOptIn && !owner.disabledByModeration ? owner.displayName : ownerHandle;

  return {
    id: ch.id,
    towerId: ch.towerId,
    ownerId: ch.ownerId,
    ownerDisplayName,
    mode: ch.mode,
    building: ch.building,
    dateUTC: ch.daily?.dateUTC ?? null,
    physicsVersion: ch.physicsVersion,
    rulesetVersion: ch.rulesetVersion,
    versionCompatible: isChallengeVersionCompatible(ch),
    targetResult: { ...ch.targetResult },
    attemptsCount: ch.attempts.length,
    challengerWins: ch.attempts.filter(a => a.winner === "challenger").length,
  };
}

/**
 * W1 Leaderboard Tie-Break Comparison:
 * 1. Higher population
 * 2. Higher height (floors)
 * 3. Higher accuracy
 * 4. Higher perfectCount
 * 5. Shorter durationTicks
 */
export function compareChallengeResult(
  challenger: RunResult,
  target: RunResult,
): "challenger" | "creator" | "tie" {
  if (challenger.population !== target.population) {
    return challenger.population > target.population ? "challenger" : "creator";
  }
  if (challenger.height !== target.height) {
    return challenger.height > target.height ? "challenger" : "creator";
  }
  if (challenger.accuracy !== target.accuracy) {
    return challenger.accuracy > target.accuracy ? "challenger" : "creator";
  }
  if (challenger.perfectCount !== target.perfectCount) {
    return challenger.perfectCount > target.perfectCount ? "challenger" : "creator";
  }
  if (challenger.durationTicks !== target.durationTicks) {
    return challenger.durationTicks < target.durationTicks ? "challenger" : "creator";
  }
  return "tie";
}

export function issueChallengeTicket(
  store: SocialStore,
  req: { challengeId: string; challengerId: string | null; now?: number },
): { ok: true; ticket: ChallengeTicket } | { ok: false; status: number; code: string } {
  if (!req.challengerId) {
    return { ok: false, status: 401, code: "UNAUTHORIZED" };
  }
  const ch = store.challenges.get(req.challengeId);
  if (!ch || ch.revokedAt !== null || ch.disabledByModeration) {
    return { ok: false, status: 404, code: "NOT_FOUND" };
  }
  const tower = store.towers.get(ch.towerId);
  if (!tower || tower.revokedAt !== null || tower.disabledByModeration) {
    return { ok: false, status: 404, code: "NOT_FOUND" };
  }
  if (req.challengerId === ch.ownerId) {
    return { ok: false, status: 400, code: "SELF_CHALLENGE_FORBIDDEN" };
  }
  if (!isChallengeVersionCompatible(ch)) {
    return { ok: false, status: 409, code: "VERSION_RETIRED" };
  }
  const now = req.now ?? 0;
  for (const existing of store.tickets.values()) {
    if (
      existing.challengeId === ch.id &&
      existing.challengerId === req.challengerId &&
      !existing.used &&
      existing.expiresAt > now
    ) {
      return { ok: true, ticket: existing };
    }
  }
  const ticket: ChallengeTicket = {
    ticketId: `ticket-${store.nextSeq++}`,
    challengeId: ch.id,
    challengerId: req.challengerId,
    mode: ch.mode,
    seed: ch.seed,
    building: ch.building,
    daily: ch.daily ? { ...ch.daily } : undefined,
    physicsVersion: ch.physicsVersion,
    rulesetVersion: ch.rulesetVersion,
    issuedAt: now,
    expiresAt: now + CHALLENGE_TICKET_TTL_MS,
    used: false,
  };
  store.tickets.set(ticket.ticketId, ticket);
  return { ok: true, ticket };
}

export function submitChallengeAttempt(
  store: SocialStore,
  req: {
    challengeId: string;
    ticketId: string;
    challengerId: string | null;
    record: RunRecord;
    now?: number;
  },
): { ok: true; outcome: ChallengeAttemptOutcome } | { ok: false; status: number; code: string } {
  if (!req.challengerId) {
    return { ok: false, status: 401, code: "UNAUTHORIZED" };
  }
  const ch = store.challenges.get(req.challengeId);
  if (!ch || ch.revokedAt !== null || ch.disabledByModeration) {
    return { ok: false, status: 404, code: "NOT_FOUND" };
  }
  if (!isChallengeVersionCompatible(ch)) {
    return { ok: false, status: 409, code: "VERSION_RETIRED" };
  }
  const ticket = store.tickets.get(req.ticketId);
  if (!ticket || ticket.challengeId !== ch.id) {
    return { ok: false, status: 404, code: "INVALID_TICKET" };
  }
  if (ticket.challengerId !== req.challengerId) {
    return { ok: false, status: 403, code: "TICKET_OWNER_MISMATCH" };
  }
  if (ticket.used) {
    return { ok: false, status: 409, code: "TICKET_ALREADY_USED" };
  }
  const now = req.now ?? 0;
  if (now > ticket.expiresAt) {
    return { ok: false, status: 410, code: "TICKET_EXPIRED" };
  }
  if (
    req.record.config.mode !== ch.mode ||
    req.record.config.seed !== ch.seed ||
    req.record.config.assist !== false ||
    (req.record.config.building ?? "residential") !== ch.building ||
    req.record.physicsVersion !== ch.physicsVersion ||
    req.record.rulesetVersion !== ch.rulesetVersion
  ) {
    return { ok: false, status: 400, code: "CONFIG_MISMATCH" };
  }

  let verified: { result: RunResult };
  try {
    verified = verifyRecord(req.record);
  } catch (err) {
    if (err instanceof Error && err.message === "Replay result mismatch") {
      return { ok: false, status: 400, code: "TAMPERED_RESULT" };
    }
    return { ok: false, status: 400, code: "INVALID_REPLAY" };
  }
  if (
    verified.result.population !== req.record.result.population ||
    verified.result.height !== req.record.result.height ||
    verified.result.misses !== req.record.result.misses ||
    verified.result.durationTicks !== req.record.result.durationTicks
  ) {
    return { ok: false, status: 400, code: "TAMPERED_RESULT" };
  }

  ticket.used = true;
  const winner = compareChallengeResult(verified.result, ch.targetResult);
  const outcome: ChallengeAttemptOutcome = {
    ticketId: ticket.ticketId,
    challengeId: ch.id,
    challengerId: req.challengerId,
    challengerResult: { ...verified.result },
    targetResult: { ...ch.targetResult },
    winner,
    completedAt: now,
  };
  ch.attempts.push(outcome);
  return { ok: true, outcome };
}

export function checkPendingRunGuard(save: GameSave): {
  requiresConfirmation: boolean;
  hasPendingCity: boolean;
  hasPendingDaily: boolean;
} {
  const hasPendingCity = save.city.pending !== null;
  const hasPendingDaily = save.daily.pending !== null;
  return {
    requiresConfirmation: hasPendingCity || hasPendingDaily,
    hasPendingCity,
    hasPendingDaily,
  };
}

export function getTowerShareCard(
  store: SocialStore,
  towerId: string,
  locale: "en" | "vi" = "en",
): ShareCardRenderOutput | null {
  const view = getPublicTower(store, towerId);
  if (!view) return null;
  return renderShareCardPng(
    {
      towerId: view.id,
      displayName: view.ownerDisplayName,
      mode: view.kind,
      population: view.result.population,
      height: view.result.height,
      accuracy: view.result.accuracy,
      perfectCount: view.result.perfectCount,
      rating: view.result.rating,
      dateUTC: view.dateUTC ?? undefined,
      physicsVersion: view.physicsVersion,
      rulesetVersion: view.rulesetVersion,
    },
    locale,
  );
}

const DEMO_RECORD: RunRecord = {
  schema: 1,
  config: { seed: 42, mode: "quick", assist: false },
  physicsVersion: PHYSICS_VERSION,
  rulesetVersion: RULESET_VERSION,
  inputs: [
    { tick: 81, sequence: 0, fraction: 0 },
    { tick: 189, sequence: 1, fraction: 0 },
    { tick: 518, sequence: 2, fraction: 0 },
    { tick: 615, sequence: 3, fraction: 0 },
    { tick: 733, sequence: 4, fraction: 0 },
    { tick: 827, sequence: 5, fraction: 0 },
    { tick: 945, sequence: 6, fraction: 0 },
    { tick: 1039, sequence: 7, fraction: 0 },
    { tick: 1104, sequence: 8, fraction: 0 },
    { tick: 1207, sequence: 9, fraction: 0 },
    { tick: 1303, sequence: 10, fraction: 0 },
  ],
  endTick: 1388,
  result: {
    population: 88,
    height: 8,
    accuracy: 83.443,
    perfectCount: 1,
    bestStreak: 1,
    durationTicks: 1388,
    misses: 3,
    ranked: true,
    rating: "B",
    ratingVersion: "quick-rating-1",
  },
};

export function createDemoSocialStore(): SocialStore {
  const store = createSocialStore();
  upsertPlayerProfile(store, {
    playerId: "demo-architect",
    displayName: "Skyline Builder",
    publicOptIn: true,
    email: "private-architect@example.com",
    cloudPayload: { secretSaveToken: "do-not-leak-cloud-payload" },
    deviceMetadata: { ip: "198.51.100.42", device: "PrivatePhone" },
    now: 1792380000000,
  });
  upsertPlayerProfile(store, {
    playerId: "private-player",
    displayName: "Hidden Player",
    publicOptIn: false,
    email: "hidden@example.com",
    now: 1792380000000,
  });
  publishTower(store, {
    ownerId: "demo-architect",
    runId: "demo-run-1",
    record: DEMO_RECORD,
    now: 1792380100000,
    privateMetadata: {
      email: "private-architect@example.com",
      ip: "198.51.100.42",
      userAgent: "PrivateBrowser/1.0",
      installationId: "install-secret-999",
      cloudSave: { secret: "never-expose" },
    },
  });
  // Also register a retired-version challenge to demonstrate version-retired handling
  store.challenges.set("challenge-retired", {
    id: "challenge-retired",
    towerId: "tower-1",
    ownerId: "demo-architect",
    mode: "quick",
    seed: 42,
    building: "residential",
    physicsVersion: "physics-0.9.0-retired",
    rulesetVersion: "quick-tower-0.9.0-retired",
    targetResult: { ...DEMO_RECORD.result },
    createdAt: 1792300000000,
    revokedAt: null,
    disabledByModeration: false,
    attempts: [],
  });
  return store;
}

