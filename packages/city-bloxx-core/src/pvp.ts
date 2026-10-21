import { isBuildingId, type BuildingId } from "./buildings";
import { DEFAULT_EQUIPMENT, validateRunEquipment, type RunEquipment } from "./cosmetics";
import { checkedAdd } from "./missions";
import { QuickTowerGame, type DropInput, type PlacementQuality, type QuickTowerSnapshot, type RunPhase } from "./run";
import { STARTING_COINS, type GameSave } from "./save-state";

export const PVP_PRESET_POTS = Object.freeze([100, 200, 500, 1000, 2000] as const);
export const PVP_MIN_POT = 20;
export const PVP_MAX_POT = 50000;
export const PVP_FORFEIT_TIMEOUT_MS = 15000;
export const PVP_COUNTDOWN_MS = 3000;

export interface PvpEmoteDefinition {
  id: string;
  icon: string;
  en: string;
  vi: string;
}

export const PVP_EMOTES: readonly PvpEmoteDefinition[] = Object.freeze([
  { id: "wave", icon: "👋", en: "Hello!", vi: "Chào bạn!" },
  { id: "raise", icon: "🔥", en: "Raise the pot!", vi: "Tăng cược lên đi!" },
  { id: "hurry", icon: "⚡", en: "Let's go!", vi: "Nhanh nào!" },
  { id: "cool", icon: "😎", en: "Confident!", vi: "Tự tin chiến thắng!" },
  { id: "gg", icon: "🤝", en: "Good game!", vi: "Trận đấu hay!" },
]);

export type PvpSlot = "p1" | "p2";
export type PvpRoomStatus = "waiting" | "countdown" | "active" | "settling" | "completed" | "aborted";
export type PvpPlayerActivity = "lobby" | "customizing" | "ready" | "playing" | "finished" | "disconnected";
export type PvpOutcomeReason = "higher_tower" | "higher_population" | "more_perfects" | "draw" | "forfeit";

export interface PvpEmotePayload {
  id: string;
  text: string;
  sentAt: number;
}

export interface PvpPlayerState {
  id: string;
  name: string;
  coins: number;
  wins: number;
  losses: number;
  badge: string | null;
  equipment: RunEquipment;
  activity: PvpPlayerActivity;
  ready: boolean;
  stakeLocked: boolean;
  connected: boolean;
  emote: PvpEmotePayload | null;
}

export interface PvpLiveTelemetry {
  tick: number;
  height: number;
  population: number;
  lives: number;
  combo: number;
  perfectCount: number;
  lastPlacement: PlacementQuality | null;
  phase: RunPhase;
  ended: boolean;
  updatedAt: number;
}

export interface PvpPlayerMatchSummary {
  height: number;
  population: number;
  perfectCount: number;
  lives: number;
}

export interface PvpMatchResult {
  winnerSlot: PvpSlot | "draw";
  loserSlot: PvpSlot | null;
  reason: PvpOutcomeReason;
  totalPot: number;
  stakePerPlayer: number;
  payouts: { p1: number; p2: number };
  netDelta: { p1: number; p2: number };
  p1Summary: PvpPlayerMatchSummary;
  p2Summary: PvpPlayerMatchSummary;
  verified: boolean;
  settledAt: number;
}

export interface PvpRoomState {
  roomId: string;
  roomCode: string;
  seed: number;
  building: BuildingId;
  stakePerPlayer: number;
  totalPot: number;
  status: PvpRoomStatus;
  createdAt: number;
  startsAt: number | null;
  players: {
    p1: PvpPlayerState;
    p2: PvpPlayerState | null;
  };
  live: {
    p1: PvpLiveTelemetry;
    p2: PvpLiveTelemetry;
  };
  drops: {
    p1: DropInput[];
    p2: DropInput[];
  };
  result: PvpMatchResult | null;
}

export interface PvpGlobalStats {
  onlinePlayers: number;
  activeMatches: number;
  totalMatchesCompleted: number;
  totalCoinsWagered: number;
  biggestPotWon: number;
  highestPvpTower: number;
  totalFloorsBuiltInPvp: number;
  updatedAt: number;
}

export interface PvpRecentMatch {
  id: string;
  roomId: string;
  roomCode: string;
  totalPot: number;
  winnerSlot: PvpSlot | "draw";
  reason: PvpOutcomeReason;
  p1: { id: string; name: string; height: number; population: number };
  p2: { id: string; name: string; height: number; population: number };
  endedAt: number;
}

export interface PvpLeaderboardEntry {
  id: string;
  name: string;
  wins: number;
  losses: number;
  draws: number;
  netCoinsWon: number;
  bestHeight: number;
  elo: number;
  updatedAt: number;
}

const integer = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

export function emptyPvpLiveTelemetry(at = 0): PvpLiveTelemetry {
  return {
    tick: 0,
    height: 0,
    population: 0,
    lives: 3,
    combo: 0,
    perfectCount: 0,
    lastPlacement: null,
    phase: "swing",
    ended: false,
    updatedAt: at,
  };
}

export function emptyPvpGlobalStats(at = 0): PvpGlobalStats {
  return {
    onlinePlayers: 1,
    activeMatches: 0,
    totalMatchesCompleted: 0,
    totalCoinsWagered: 0,
    biggestPotWon: 0,
    highestPvpTower: 0,
    totalFloorsBuiltInPvp: 0,
    updatedAt: at,
  };
}

export function validateTotalPot(totalPot: number, hostCoins?: number): { totalPot: number; stakePerPlayer: number } {
  if (!integer(totalPot) || totalPot < PVP_MIN_POT || totalPot > PVP_MAX_POT || totalPot % 2 !== 0) {
    throw new Error("Total pot must be an even integer between 20 and 50000 Coins");
  }
  const stakePerPlayer = totalPot / 2;
  if (hostCoins !== undefined && (!integer(hostCoins) || hostCoins < stakePerPlayer)) {
    throw new Error("Insufficient Coins to configure this total pot");
  }
  return { totalPot, stakePerPlayer };
}

export function createPvpRoomState(params: {
  roomId: string;
  roomCode: string;
  seed: number;
  building?: BuildingId;
  totalPot: number;
  createdAt: number;
  host: {
    id: string;
    name: string;
    coins: number;
    wins?: number;
    losses?: number;
    badge?: string | null;
    equipment?: RunEquipment;
  };
}): PvpRoomState {
  const building = params.building ?? "residential";
  if (!isBuildingId(building)) throw new Error("Invalid PvP building class");
  const { totalPot, stakePerPlayer } = validateTotalPot(params.totalPot, params.host.coins);
  const equipment = validateRunEquipment(params.host.equipment ?? { ...DEFAULT_EQUIPMENT }, building);
  return {
    roomId: params.roomId,
    roomCode: params.roomCode.toUpperCase(),
    seed: params.seed | 0,
    building,
    stakePerPlayer,
    totalPot,
    status: "waiting",
    createdAt: params.createdAt,
    startsAt: null,
    players: {
      p1: {
        id: params.host.id,
        name: params.host.name,
        coins: params.host.coins,
        wins: params.host.wins ?? 0,
        losses: params.host.losses ?? 0,
        badge: params.host.badge ?? null,
        equipment,
        activity: "lobby",
        ready: false,
        stakeLocked: false,
        connected: true,
        emote: null,
      },
      p2: null,
    },
    live: {
      p1: emptyPvpLiveTelemetry(params.createdAt),
      p2: emptyPvpLiveTelemetry(params.createdAt),
    },
    drops: {
      p1: [],
      p2: [],
    },
    result: null,
  };
}

export function joinPvpRoomState(
  room: PvpRoomState,
  guest: {
    id: string;
    name: string;
    coins: number;
    wins?: number;
    losses?: number;
    badge?: string | null;
    equipment?: RunEquipment;
  },
): PvpRoomState {
  if (room.status !== "waiting") throw new Error("Room is no longer accepting players");
  const equipment = validateRunEquipment(guest.equipment ?? { ...DEFAULT_EQUIPMENT }, room.building);
  if (room.players.p1.id === guest.id) {
    return {
      ...room,
      players: {
        ...room.players,
        p1: { ...room.players.p1, coins: guest.coins, equipment, connected: true },
      },
    };
  }
  if (room.players.p2 && room.players.p2.id !== guest.id) {
    throw new Error("Room is already full");
  }
  return {
    ...room,
    players: {
      ...room.players,
      p2: {
        id: guest.id,
        name: guest.name,
        coins: guest.coins,
        wins: guest.wins ?? 0,
        losses: guest.losses ?? 0,
        badge: guest.badge ?? null,
        equipment,
        activity: "lobby",
        ready: false,
        stakeLocked: false,
        connected: true,
        emote: null,
      },
    },
  };
}

export function updateRoomTotalPot(room: PvpRoomState, newTotalPot: number): PvpRoomState {
  if (room.status !== "waiting") throw new Error("Cannot change wager after match countdown begins");
  const { totalPot, stakePerPlayer } = validateTotalPot(newTotalPot, room.players.p1.coins);
  return {
    ...room,
    totalPot,
    stakePerPlayer,
    players: {
      p1: { ...room.players.p1, ready: false, stakeLocked: false, activity: "lobby" },
      p2: room.players.p2 ? { ...room.players.p2, ready: false, stakeLocked: false, activity: "lobby" } : null,
    },
  };
}

export function canReadyPvpPlayer(room: PvpRoomState, slot: PvpSlot): boolean {
  const player = room.players[slot];
  if (!player || room.status !== "waiting") return false;
  return integer(player.coins) && player.coins >= room.stakePerPlayer;
}

export function setPvpPlayerReady(room: PvpRoomState, slot: PvpSlot, ready: boolean, at: number): PvpRoomState {
  if (room.status !== "waiting") return room;
  const player = room.players[slot];
  if (!player) throw new Error("Player slot is empty");
  if (ready && !canReadyPvpPlayer(room, slot)) {
    throw new Error("Insufficient Coins for room stake");
  }
  const updatedPlayer: PvpPlayerState = {
    ...player,
    ready,
    stakeLocked: ready,
    activity: ready ? "ready" : "lobby",
  };
  const nextPlayers = {
    ...room.players,
    [slot]: updatedPlayer,
  };
  const bothReady = !!nextPlayers.p1.ready && !!nextPlayers.p2?.ready;
  return {
    ...room,
    status: bothReady ? "active" : "waiting",
    startsAt: bothReady ? at : null,
    players: {
      p1: bothReady ? { ...nextPlayers.p1, activity: "playing" } : nextPlayers.p1,
      p2: nextPlayers.p2 ? (bothReady ? { ...nextPlayers.p2, activity: "playing" } : nextPlayers.p2) : null,
    },
  };
}

export function lockPvpStake(save: GameSave, roomId: string, stakePerPlayer: number): GameSave {
  if (!roomId || !integer(stakePerPlayer) || stakePerPlayer <= 0) throw new Error("Invalid PvP stake");
  const receipt = `pvp-stake:${roomId}`;
  const receipts = save.coinReceipts ?? [];
  if (receipts.includes(receipt)) return save;
  const currentCoins = save.coins ?? STARTING_COINS;
  if (!integer(currentCoins) || currentCoins < stakePerPlayer) {
    throw new Error("Insufficient Coins to lock PvP stake");
  }
  return {
    ...save,
    coins: currentCoins - stakePerPlayer,
    coinReceipts: [...receipts, receipt].slice(-64),
  };
}

export function refundPvpStake(save: GameSave, roomId: string, stakePerPlayer: number): GameSave {
  if (!roomId || !integer(stakePerPlayer) || stakePerPlayer <= 0) return save;
  const stakeReceipt = `pvp-stake:${roomId}`;
  const refundReceipt = `pvp-refund:${roomId}`;
  const receipts = save.coinReceipts ?? [];
  if (!receipts.includes(stakeReceipt) || receipts.includes(refundReceipt) || receipts.includes(`pvp-settle:${roomId}`)) {
    return save;
  }
  const currentCoins = save.coins ?? STARTING_COINS;
  return {
    ...save,
    coins: checkedAdd(currentCoins, stakePerPlayer),
    coinReceipts: [...receipts, refundReceipt].slice(-64),
  };
}

export function resolvePvpMatchResult(
  room: PvpRoomState,
  settledAt: number,
  forfeitSlot?: PvpSlot,
): PvpMatchResult {
  if (room.result) return room.result;
  const p1 = room.live.p1;
  const p2 = room.live.p2;
  const totalPot = room.totalPot;
  const stakePerPlayer = room.stakePerPlayer;
  const p1Summary: PvpPlayerMatchSummary = {
    height: p1.height,
    population: p1.population,
    perfectCount: p1.perfectCount,
    lives: p1.lives,
  };
  const p2Summary: PvpPlayerMatchSummary = {
    height: p2.height,
    population: p2.population,
    perfectCount: p2.perfectCount,
    lives: p2.lives,
  };

  if (forfeitSlot === "p1" || forfeitSlot === "p2") {
    const winnerSlot: PvpSlot = forfeitSlot === "p1" ? "p2" : "p1";
    return {
      winnerSlot,
      loserSlot: forfeitSlot,
      reason: "forfeit",
      totalPot,
      stakePerPlayer,
      payouts: winnerSlot === "p1" ? { p1: totalPot, p2: 0 } : { p1: 0, p2: totalPot },
      netDelta: winnerSlot === "p1" ? { p1: stakePerPlayer, p2: -stakePerPlayer } : { p1: -stakePerPlayer, p2: stakePerPlayer },
      p1Summary,
      p2Summary,
      verified: true,
      settledAt,
    };
  }

  const p1Out = p1.lives <= 0 || p1.ended;
  const p2Out = p2.lives <= 0 || p2.ended;
  if (!p1Out || !p2Out) {
    throw new Error("Both players must exhaust all 3 lives before resolving Solo PvP outcome");
  }

  let winnerSlot: PvpSlot | "draw" = "draw";
  let loserSlot: PvpSlot | null = null;
  let reason: PvpOutcomeReason = "draw";

  if (p1.height !== p2.height) {
    winnerSlot = p1.height > p2.height ? "p1" : "p2";
    loserSlot = winnerSlot === "p1" ? "p2" : "p1";
    reason = "higher_tower";
  } else if (p1.population !== p2.population) {
    winnerSlot = p1.population > p2.population ? "p1" : "p2";
    loserSlot = winnerSlot === "p1" ? "p2" : "p1";
    reason = "higher_population";
  } else if (p1.perfectCount !== p2.perfectCount) {
    winnerSlot = p1.perfectCount > p2.perfectCount ? "p1" : "p2";
    loserSlot = winnerSlot === "p1" ? "p2" : "p1";
    reason = "more_perfects";
  }

  const payouts =
    winnerSlot === "p1"
      ? { p1: totalPot, p2: 0 }
      : winnerSlot === "p2"
        ? { p1: 0, p2: totalPot }
        : { p1: stakePerPlayer, p2: stakePerPlayer };

  const netDelta =
    winnerSlot === "p1"
      ? { p1: stakePerPlayer, p2: -stakePerPlayer }
      : winnerSlot === "p2"
        ? { p1: -stakePerPlayer, p2: stakePerPlayer }
        : { p1: 0, p2: 0 };

  return {
    winnerSlot,
    loserSlot,
    reason,
    totalPot,
    stakePerPlayer,
    payouts,
    netDelta,
    p1Summary,
    p2Summary,
    verified: true,
    settledAt,
  };
}

export function settlePvpWager(save: GameSave, roomId: string, slot: PvpSlot, result: PvpMatchResult): GameSave {
  const settleReceipt = `pvp-settle:${roomId}`;
  const stakeReceipt = `pvp-stake:${roomId}`;
  const receipts = save.coinReceipts ?? [];
  if (receipts.includes(settleReceipt)) return save;
  const currentCoins = save.coins ?? STARTING_COINS;
  const hadLockedStake = receipts.includes(stakeReceipt);
  const nextCoins = hadLockedStake
    ? checkedAdd(currentCoins, result.payouts[slot])
    : Math.max(0, currentCoins + result.netDelta[slot]);
  return {
    ...save,
    coins: nextCoins,
    coinReceipts: [...receipts, settleReceipt].slice(-64),
  };
}

export function extractLiveTelemetryFromSnapshot(snapshot: QuickTowerSnapshot, updatedAt: number): PvpLiveTelemetry {
  return {
    tick: snapshot.tick,
    height: snapshot.floors.length,
    population: snapshot.population,
    lives: snapshot.lives,
    combo: snapshot.comboLevel,
    perfectCount: snapshot.perfectCount,
    lastPlacement: snapshot.lastPlacement,
    phase: snapshot.phase,
    ended: snapshot.phase === "ended" || snapshot.lives <= 0,
    updatedAt,
  };
}

export function createOpponentReplicaGame(seed: number, building: BuildingId = "residential"): QuickTowerGame {
  return new QuickTowerGame({ seed: seed | 0, mode: "quick", assist: false, building });
}

export function syncOpponentReplica(
  replica: QuickTowerGame,
  drops: readonly DropInput[],
  targetTick: number,
): QuickTowerSnapshot {
  const sorted = [...drops].sort((a, b) => a.sequence - b.sequence || a.tick - b.tick);
  const alreadyApplied = replica.getSnapshot().drops.length;
  for (let i = alreadyApplied; i < sorted.length; i++) {
    const input = sorted[i];
    if (input.tick > replica.getTick()) {
      replica.advanceTicks(input.tick - replica.getTick());
    }
    replica.drop(input.fraction / 1000);
  }
  if (targetTick > replica.getTick() && replica.getPhase() !== "ended") {
    replica.advanceTicks(Math.min(600, targetTick - replica.getTick()));
  }
  return replica.getSnapshot();
}
