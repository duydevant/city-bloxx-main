import type { RunRecord } from "./run";
import { validateRecord, verifyRecord } from "./replay";
import { acceptCityTower, emptyCity, validateCity, type CitySave } from "./city";
import { BUILDING_IDS, BUILDINGS, isBuildingId } from "./buildings";
import { QUALITIES, type RunMetrics } from "./metrics";
import { applySummary, emptyStats, emptyTotals, makeSummary, runXP, RUN_REWARD_VERSION, type LifetimeStats, type RunContext, type RunIdentity, type RunSummary, type StatTotals, type StatsGroup } from "./tracking";
import { emptyDaily, settleDaily, validateDailyState, type DailyState } from "./daily-state";
import { validateDaily } from "./daily";
import { restoreTower } from "./checkpoint";
import { acceptedProgression, emptyProgression, normalizeProgression, settleProgression, type ProgressionState } from "./progression";
import { emptyInventory, grantCosmetics, normalizeInventory, validateRunEquipment, type InventoryState } from "./cosmetics";
export type { DailyState } from "./daily-state";
export type { ProgressionState } from "./progression-types";
export type { InventoryState } from "./cosmetics";

export const HISTORY_LIMIT = 50;
export const SAVE_BUDGET_BYTES = 256 * 1024;
export interface SettingsState { muted: boolean; reducedMotion: boolean | null; locale: "en" | "vi" | null }
export interface TutorialState { quick: boolean; city: boolean; daily: boolean }
export function completeTutorial(save: GameSave, mode: keyof TutorialState): GameSave {
  return save.tutorials[mode] ? save : { ...save, tutorials: { ...save.tutorials, [mode]: true } };
}
interface ActiveQuick extends RunContext { progress: RunSummary | null }
interface PendingCity extends RunContext { cityRunId: string }
export interface GameSave {
  schema: 4; standardQuickBest: number; assistQuickBest: number; runs: number;
  lastReplay: RunRecord | null; city: CitySave; settings: SettingsState; tutorials: TutorialState; stats: LifetimeStats;
  progression: ProgressionState; inventory: InventoryState; daily: DailyState;
  history: RunSummary[]; replays: { id: string; record: RunRecord }[];
  replayRefs: { latest: string | null; best: string | null; pinned: string | null };
  tracking: { installationId: string; nextSequence: number; settled: [number, number][]; activeQuick: ActiveQuick | null; pendingCity: PendingCity | null };
}
export function emptySave(): GameSave {
  return { schema: 4, standardQuickBest: 0, assistQuickBest: 0, runs: 0, lastReplay: null, city: emptyCity(),
    settings: { muted: false, reducedMotion: null, locale: null }, tutorials: { quick:false, city:false, daily:false }, stats: emptyStats(),
    progression: emptyProgression(),
    inventory: emptyInventory(),
    daily: emptyDaily(), history: [], replays: [],
    replayRefs: { latest: null, best: null, pinned: null },
    tracking: { installationId: "", nextSequence: 1, settled: [], activeQuick: null, pendingCity: null } };
}
const integer = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const tag = (n: unknown): n is string => typeof n === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(n);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function reject(): never { throw new Error("Invalid save bounds; original save preserved"); }
function validIdentity(value: RunIdentity, next: number, installation: string): boolean {
  return !!value && value.installationId === installation && integer(value.sequence) && value.sequence > 0 && value.sequence < next && value.id === `${installation}:${value.sequence}`;
}
function validMetrics(m: RunMetrics | null): boolean {
  return m === null || !!m && integer(m.foundation) && m.foundation <= 1 && !!m.body && QUALITIES.every(k => integer(m.body[k])) &&
    (m.roof === null || QUALITIES.includes(m.roof)) && integer(m.maxCombo) && integer(m.errorCount) &&
    m.errorCount === QUALITIES.reduce((sum, k) => sum + m.body[k], 0) && finite(m.signedErrorSum) &&
    Array.isArray(m.signedErrors) && m.signedErrors.length <= 32 && m.signedErrors.length <= m.errorCount && m.signedErrors.every(finite) &&
    (m.roofError === null || finite(m.roofError));
}
function validResult(r: RunRecord["result"]): boolean {
  return !!r && [r.population, r.height, r.perfectCount, r.bestStreak, r.durationTicks, r.misses].every(integer) &&
    finite(r.accuracy) && r.accuracy >= 0 && r.accuracy <= 100 && typeof r.ranked === "boolean" &&
    ["S", "A", "B", "C", "D"].includes(r.rating) && tag(r.ratingVersion);
}
function validSummary(s: RunSummary, next: number, installation: string): boolean {
  try { validateRunEquipment(s?.equipment,s?.building); } catch { return false; }
  if (s?.mode === "daily") {
    try { const d = validateDaily(s.daily); if (s.building !== d.classId || s.seed !== d.seed || s.physicsVersion !== d.physicsVersion || s.rulesetVersion !== d.rulesetVersion || s.assist || s.result?.ranked || s.result?.height > d.targetBodyFloors) return false; } catch { return false; }
  } else if (s?.daily !== undefined) return false;
  return !!s && validIdentity(s.identity, next, installation) && integer(s.startedAt) && integer(s.endedAt) &&
    (s.startedAt === 0 || s.endedAt >= s.startedAt) && ["quick", "city", "daily"].includes(s.mode) && isBuildingId(s.building) &&
    typeof s.assist === "boolean" && !(s.mode === "city" && s.assist) && Number.isInteger(s.seed) && tag(s.physicsVersion) && tag(s.rulesetVersion) &&
    integer(s.endTick) && validResult(s.result) && s.result.durationTicks === s.endTick && validMetrics(s.metrics) &&
    ["ended", "abandoned"].includes(s.outcome) && s.complete === (s.mode !== "quick" && s.outcome === "ended" && s.result.height === BUILDINGS[s.building].floors) &&
    s.verification === "local" && ["available", "pruned", "unsupported", "not-recorded"].includes(s.replayStatus) &&
    (s.xpEarned === undefined || integer(s.xpEarned)) && (s.rewardVersion === undefined || tag(s.rewardVersion)) &&
    [s.baseXPEarned, s.bonusXPEarned, s.builderXPBefore].every(n => n === undefined || integer(n)) &&
    (s.progressionRewardVersion === undefined || tag(s.progressionRewardVersion)) &&
    (s.unlockedAchievements === undefined || Array.isArray(s.unlockedAchievements) && s.unlockedAchievements.length <= 128 && s.unlockedAchievements.every(tag)) &&
    (s.unlockedCosmetics === undefined || Array.isArray(s.unlockedCosmetics) && s.unlockedCosmetics.length <= 128 && s.unlockedCosmetics.every(tag));
}
function validTotals(t: StatTotals): boolean {
  return !!t && [t.attempts, t.abandoned, t.landedBody, t.scoredBody, t.population, t.bestHeight, t.bestStreak, t.completed, t.maxCombo, t.errorCount].every(integer) &&
    !!t.quality && !!t.roof && QUALITIES.every(k => integer(t.quality[k]) && integer(t.roof[k])) && finite(t.signedErrorSum) &&
    t.scoredBody === QUALITIES.reduce((sum, k) => sum + t.quality[k], 0) && t.landedBody === t.scoredBody - t.quality.miss && t.errorCount === t.scoredBody;
}
function validateV4(s: GameSave): GameSave {
  const tr = s.tracking;
  if (!tr || !(tr.installationId === "" || tag(tr.installationId)) || !integer(tr.nextSequence) || tr.nextSequence < 1 || !Array.isArray(tr.settled) || tr.settled.length > 8) reject();
  let previous = 0;
  for (const range of tr.settled) {
    if (!Array.isArray(range) || range.length !== 2 || !integer(range[0]) || range[0] < 1 || range[0] <= previous || !integer(range[1]) || range[1] < range[0] || range[1] >= tr.nextSequence) reject();
    previous = range[1] + 1;
  }
  if (!s.settings || typeof s.settings.muted !== "boolean" || ![null, true, false].includes(s.settings.reducedMotion) || ![null, "en", "vi"].includes(s.settings.locale)) reject();
  if (s.tutorials === undefined) s = { ...s, tutorials: { quick:true, city:true, daily:true } };
  if (!s.tutorials || ![s.tutorials.quick,s.tutorials.city,s.tutorials.daily].every(v=>typeof v === "boolean")) reject();
  if (!s.stats || !integer(s.stats.trackedSince) || !validTotals(s.stats.totals) || !s.stats.byMode || !s.stats.byClass ||
    !["quick-standard", "quick-assist", "city", "daily"].every(k => validTotals(s.stats.byMode[k as StatsGroup])) || !BUILDING_IDS.every(k => validTotals(s.stats.byClass[k]))) reject();
  if (!s.progression || s.progression.version !== 1 || !integer(s.progression.xp) || !s.progression.masteryXP || !BUILDING_IDS.every(k => integer(s.progression.masteryXP[k])) ||
    !Array.isArray(s.progression.achievements) || s.progression.achievements.length > 128 || !s.progression.achievements.every(tag)) reject();
  s = { ...s, inventory: normalizeInventory(s.inventory) };
  validateRunEquipment(tr.activeQuick?.equipment,"residential"); validateRunEquipment(tr.pendingCity?.equipment,s.city.pending?.classId); validateRunEquipment(s.daily.pending?.equipment,s.daily.pending?.checkpoint.config.building);
  s = { ...s, daily: validateDailyState(s.daily) };
  s = { ...s, progression: normalizeProgression(s) };
  const dp = s.daily.pending;
  if (dp && (!validIdentity(dp.identity, tr.nextSequence, tr.installationId) || isSettled(s, dp.identity) && restoreTower(dp.checkpoint).getPhase() !== "ended" || dp.identity.id === tr.activeQuick?.identity.id || dp.identity.id === tr.pendingCity?.identity.id)) reject();
  if (!Array.isArray(s.history) || s.history.length > HISTORY_LIMIT || !s.history.every(summary => validSummary(summary, tr.nextSequence, tr.installationId)) ||
    new Set(s.history.map(h => h.identity.id)).size !== s.history.length || !Array.isArray(s.replays) || s.replays.length > 3 || !s.replayRefs) reject();
  if (tr.activeQuick !== null && (!tr.activeQuick || !validIdentity(tr.activeQuick.identity, tr.nextSequence, tr.installationId) || !integer(tr.activeQuick.startedAt) ||
    isSettled(s, tr.activeQuick.identity) || tr.activeQuick.progress !== null && (!validSummary(tr.activeQuick.progress, tr.nextSequence, tr.installationId) || tr.activeQuick.progress.identity.id !== tr.activeQuick.identity.id))) reject();
  if (tr.pendingCity !== null && (!tr.pendingCity || !validIdentity(tr.pendingCity.identity, tr.nextSequence, tr.installationId) || !integer(tr.pendingCity.startedAt) || !s.city.pending || tr.pendingCity.cityRunId !== s.city.pending.runId)) reject();
  if (tr.activeQuick && tr.pendingCity && tr.activeQuick.identity.id === tr.pendingCity.identity.id) reject();
  if (s.history.some(h => !isSettled(s, h.identity))) reject();
  const next = copy(s), ids = new Set<string>();
  next.replays = next.replays.filter(entry => {
    if (!entry || typeof entry.id !== "string" || ids.has(entry.id) || !next.history.some(h => h.identity.id === entry.id && ["quick", "daily"].includes(h.mode) && h.outcome === "ended")) reject();
    ids.add(entry.id);
    try { entry.record = validateRecord(entry.record); return true; } catch { return false; }
  });
  for (const key of ["latest", "best", "pinned"] as const) {
    const id = next.replayRefs[key];
    if (id !== null && typeof id !== "string") reject();
    if (!next.replays.some(r => r.id === id)) next.replayRefs[key] = null;
  }
  next.lastReplay = next.replays.find(r => r.id === next.replayRefs.latest)?.record ?? null;
  next.history = next.history.map(h => ({ ...h, replayStatus: next.replays.some(r => r.id === h.identity.id) ? "available" : h.replayStatus === "available" ? "unsupported" : h.replayStatus }));
  return next;
}
export function migrateSave(value: unknown): GameSave {
  if (!value || typeof value !== "object") throw new Error("Invalid save; original data preserved");
  const s = value as GameSave;
  if (![1, 2, 3, 4].includes(s.schema)) throw new Error("Unknown save schema; original save preserved");
  if (s.schema === 4) {
    if (![s.standardQuickBest, s.assistQuickBest, s.runs].every(integer)) reject();
    const legacyOwned = (s.city as CitySave & { inventory?: { skins: string[] } }).inventory?.skins ?? [];
    return validateV4({ ...s, inventory: normalizeInventory(s.inventory, legacyOwned), city: validateCity(s.city), stats: s.stats?.byMode && s.stats.byMode.daily === undefined ? { ...s.stats, byMode: { ...s.stats.byMode, daily: emptyTotals() } } : s.stats });
  }
  const next = emptySave();
  next.tutorials = { quick:true, city:true, daily:true }; // Existing players never repeat onboarding.
  next.standardQuickBest = integer(s.standardQuickBest) ? s.standardQuickBest : 0;
  next.assistQuickBest = integer(s.assistQuickBest) ? s.assistQuickBest : 0;
  next.runs = integer(s.runs) ? s.runs : 0;
  if ((s.schema as number) === 3) { next.city = validateCity(s.city); next.inventory = normalizeInventory(next.inventory, (s.city as CitySave & { inventory?: { skins: string[] } }).inventory?.skins ?? []); }
  if (s.lastReplay) {
    let supported: RunRecord | null = null;
    try { supported = verifyRecord(s.lastReplay); } catch { /* Optional playback must not destroy supported summary metadata. */ }
    const r = s.lastReplay;
    if (r.config?.mode === "quick" && Number.isInteger(r.config.seed) && typeof r.config.assist === "boolean" && validResult(r.result) &&
      tag(r.physicsVersion) && tag(r.rulesetVersion) && integer(r.endTick) && r.result.durationTicks === r.endTick) {
      next.tracking.installationId = "legacy";
      next.tracking.nextSequence = 2; next.tracking.settled = [[1, 1]];
      const identity = { id: "legacy:1", installationId: "legacy", sequence: 1 };
      next.history = [{ identity, startedAt: 0, endedAt: 0, endTick: r.endTick, result: copy(r.result), mode: "quick", building: "residential", assist: r.config.assist,
        seed: r.config.seed, physicsVersion: r.physicsVersion, rulesetVersion: r.rulesetVersion, metrics: null, complete: false, outcome: "ended", verification: "local", replayStatus: supported ? "available" : "unsupported" }];
      if (supported) { next.replays = [{ id: identity.id, record: supported }]; next.replayRefs.latest = identity.id; next.lastReplay = supported; }
    }
  }
  return next;
}
export function initializeTracking(save: GameSave, installationId: string, now: number): GameSave {
  if (!tag(installationId) || !integer(now)) throw new Error("Invalid tracking boundary");
  const next = { ...save, stats: { ...save.stats, trackedSince: save.stats.trackedSince || now } };
  if (save.tracking.installationId && save.tracking.installationId !== "legacy") return next;
  const rename = (id: string | null) => id ? `${installationId}:${id.split(":")[1]}` : null;
  return { ...next, tracking: { ...save.tracking, installationId },
    history: save.history.map(h => ({ ...h, identity: { ...h.identity, installationId, id: rename(h.identity.id)! } })),
    replays: save.replays.map(r => ({ ...r, id: rename(r.id)! })),
    replayRefs: { latest: rename(save.replayRefs.latest), best: rename(save.replayRefs.best), pinned: rename(save.replayRefs.pinned) } };
}
export function allocateRun(save: GameSave, startedAt: number): { save: GameSave; context: RunContext } {
  if (!integer(startedAt) || save.tracking.nextSequence >= Number.MAX_SAFE_INTEGER) throw new Error("Run identity bounds exceeded");
  const installationId = save.tracking.installationId || "local", sequence = save.tracking.nextSequence;
  const context = { identity: { id: `${installationId}:${sequence}`, installationId, sequence }, startedAt };
  return { save: { ...save, tracking: { ...save.tracking, installationId, nextSequence: sequence + 1 } }, context };
}
export function isSettled(save: GameSave, identity: RunIdentity): boolean {
  return identity.installationId === save.tracking.installationId && save.tracking.settled.some(([lo, hi]) => identity.sequence >= lo && identity.sequence <= hi);
}
function receiptRanges(ranges: [number, number][], sequence: number): [number, number][] {
  const sorted = [...ranges.map(r => [...r] as [number, number]), [sequence, sequence] as [number, number]].sort((a, b) => a[0] - b[0]);
  const result: [number, number][] = [];
  for (const range of sorted) {
    const last = result[result.length - 1];
    if (last && range[0] <= last[1] + 1) last[1] = Math.max(last[1], range[1]); else result.push(range);
  }
  if (result.length > 8) throw new Error("Too many unsettled run gaps");
  return result;
}
function lastUnprotected(history: RunSummary[], wanted: Set<string | null>): number {
  for (let i = history.length - 1; i >= 0; i--) if (!wanted.has(history[i].identity.id)) return i;
  return -1;
}
function retained(save: GameSave): GameSave {
  const wanted = new Set(Object.values(save.replayRefs));
  const replays = save.replays.filter(r => wanted.has(r.id));
  const history = save.history.filter((h, index) => index < HISTORY_LIMIT || wanted.has(h.identity.id));
  while (history.length > HISTORY_LIMIT) history.splice(lastUnprotected(history, wanted), 1);
  return { ...save, replays, history: history.map(h => ({ ...h, replayStatus: replays.some(r => r.id === h.identity.id) ? "available" : h.replayStatus === "available" ? "pruned" : h.replayStatus })),
    lastReplay: replays.find(r => r.id === save.replayRefs.latest)?.record ?? null };
}
export function settleRun(save: GameSave, summary: RunSummary, record?: RunRecord): GameSave {
  if (!validSummary(summary, save.tracking.nextSequence, save.tracking.installationId)) throw new Error("Invalid run settlement");
  if (isSettled(save, summary.identity)) return save;
  const group: StatsGroup = summary.mode === "daily" ? "daily" : summary.mode === "city" ? "city" : summary.assist ? "quick-assist" : "quick-standard";
  const quickEnded = summary.mode === "quick" && summary.outcome === "ended";
  const ranked = quickEnded && !summary.assist;
  const nextBest = ranked && summary.result.population > save.standardQuickBest;
  const xpEarned = runXP(summary);
  if (!integer(xpEarned) || !integer(save.progression.xp + xpEarned) || !integer(save.progression.masteryXP[summary.building] + xpEarned)) throw new Error("Reward bounds exceeded; previous save preserved");
  const daily = summary.mode === "daily" ? settleDaily(save.daily, summary) : save.daily;
  const progression = settleProgression(save, summary, xpEarned, daily.lifetimeCreditedDays);
  const totalXP = progression.xp - save.progression.xp;
  const next: GameSave = { ...save,
    standardQuickBest: ranked ? Math.max(save.standardQuickBest, summary.result.population) : save.standardQuickBest,
    assistQuickBest: quickEnded && summary.assist ? Math.max(save.assistQuickBest, summary.result.population) : save.assistQuickBest,
    runs: save.runs + Number(quickEnded),
    daily,
    stats: { ...save.stats, totals: applySummary(save.stats.totals, summary), byMode: { ...save.stats.byMode, [group]: applySummary(save.stats.byMode[group], summary) },
      byClass: { ...save.stats.byClass, [summary.building]: applySummary(save.stats.byClass[summary.building], summary) } },
    history: [{ ...copy(summary), xpEarned: totalXP, baseXPEarned: xpEarned, bonusXPEarned: totalXP - xpEarned, builderXPBefore: save.progression.xp,
      unlockedAchievements: progression.achievements.filter(id => !save.progression.achievements.includes(id)), progressionRewardVersion: progression.catalogVersion, rewardVersion: RUN_REWARD_VERSION }, ...save.history], replays: [...save.replays], replayRefs: { ...save.replayRefs },
    progression,
    tracking: { ...save.tracking, settled: receiptRanges(save.tracking.settled, summary.identity.sequence),
      activeQuick: save.tracking.activeQuick?.identity.id === summary.identity.id ? null : save.tracking.activeQuick } };
  if (record && summary.outcome === "ended" && ["quick", "daily"].includes(summary.mode) && record.inputs.length <= 4096 && record.endTick <= 432000) {
    const valid = validateRecord(record);
    if (valid.config.mode !== summary.mode || valid.config.assist !== summary.assist || valid.config.seed !== summary.seed || valid.config.daily?.id !== summary.daily?.id || valid.endTick !== summary.endTick || JSON.stringify(valid.result) !== JSON.stringify(summary.result)) throw new Error("Replay settlement mismatch");
    next.replays.push({ id: summary.identity.id, record: valid }); next.replayRefs.latest = summary.identity.id;
    if (nextBest) next.replayRefs.best = summary.identity.id;
  }
  const awarded = grantCosmetics(next, summary.endedAt), items = awarded.inventory.owned.filter(id => !save.inventory.owned.includes(id));
  if (items.length) awarded.history = awarded.history.map((h,i) => i ? h : { ...h,unlockedCosmetics:items });
  return retained(awarded);
}
export function acceptTrackedCity(save: GameSave, runId: string, at: number): GameSave {
  const pending = save.city.pending, context = save.tracking.pendingCity;
  if (!pending || pending.runId !== runId || !context || context.cityRunId !== runId) return save;
  const game = restoreTower(pending.checkpoint), summary = makeSummary(game, context, at);
  const settled = settleRun(save, summary);
  const progression = acceptedProgression(settled, summary, runId, at);
  return { ...settled, progression, city: acceptCityTower(settled.city, runId), tracking: { ...settled.tracking, pendingCity: null } };
}
// Compatibility callers intentionally allocate a NEW run; the session uses persisted contexts.
export function commitRun(save: GameSave, record: RunRecord): GameSave {
  if (record.config.mode !== "quick") throw new Error("City runs cannot update Quick scores");
  const allocated = allocateRun(save, 0);
  return settleRun(allocated.save, { ...allocated.context, mode: "quick", building: "residential", assist: record.config.assist, seed: record.config.seed,
    physicsVersion: record.physicsVersion, rulesetVersion: record.rulesetVersion, endedAt: 0, endTick: record.endTick, result: record.result,
    metrics: null, outcome: "ended", complete: false, verification: "local", replayStatus: "not-recorded" }, record);
}
export function pinReplay(save: GameSave, id: string | null): GameSave {
  if (id !== null && !save.replays.some(r => r.id === id)) throw new Error("Replay unavailable");
  return retained({ ...save, replayRefs: { ...save.replayRefs, pinned: id } });
}
export function saveByteSize(save: GameSave): number {
  const json = JSON.stringify(save);
  return Math.max(json.length * 2, new TextEncoder().encode(json).byteLength);
}
export function prepareSave(save: GameSave, maxBytes = SAVE_BUDGET_BYTES): GameSave {
  const next = copy(retained(save)), protectedIds = new Set(Object.values(next.replayRefs));
  let index = lastUnprotected(next.history, protectedIds);
  while (saveByteSize(next) + 64 > maxBytes && index >= 0) {
    next.history.splice(index, 1); index = lastUnprotected(next.history, protectedIds);
  }
  if (saveByteSize(next) + 64 > maxBytes) throw new Error("Save budget exceeded; previous save preserved");
  return next;
}
