import {
  createPvpRoomState,
  emptyPvpGlobalStats,
  joinPvpRoomState,
  resolvePvpMatchResult,
  setPvpPlayerReady,
  updateRoomTotalPot,
  validateRunEquipment,
  type BuildingId,
  type DropInput,
  type PvpEmotePayload,
  type PvpGlobalStats,
  type PvpLeaderboardEntry,
  type PvpLiveTelemetry,
  type PvpMatchResult,
  type PvpPlayerActivity,
  type PvpPort,
  type PvpRecentMatch,
  type PvpRoomState,
  type PvpSlot,
  type RunEquipment,
} from "../../../packages/city-bloxx-core/src/index";

export interface FirebasePvpTree {
  stats: {
    global: PvpGlobalStats;
    recentMatches: Record<string, PvpRecentMatch>;
    leaderboard: Record<string, PvpLeaderboardEntry>;
  };
  rooms: Record<string, PvpRoomState>;
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function generateRoomCode(seed: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let n = (seed >>> 0) || 123456789;
  let out = "";
  for (let i = 0; i < 6; i++) {
    n = Math.imul(n ^ (n >>> 15), 2246822519) >>> 0;
    out += chars[n % chars.length];
  }
  return out;
}

export class InMemoryFirebaseRtdbEngine {
  private tree: FirebasePvpTree;
  private roomListeners = new Map<string, Set<(room: PvpRoomState | null) => void>>();
  private statsListeners = new Set<
    (data: { global: PvpGlobalStats; recentMatches: PvpRecentMatch[]; leaderboard: PvpLeaderboardEntry[] }) => void
  >();

  constructor(nowMs = Date.now()) {
    this.tree = {
      stats: {
        global: emptyPvpGlobalStats(nowMs),
        recentMatches: {},
        leaderboard: {},
      },
      rooms: {},
    };
  }

  getSnapshot(): FirebasePvpTree {
    return clone(this.tree);
  }

  hydrate(cloudTree: Partial<FirebasePvpTree> | null | undefined): void {
    if (!cloudTree || typeof cloudTree !== "object") return;
    if (cloudTree.stats) {
      if (cloudTree.stats.global) {
        this.tree.stats.global = {
          ...this.tree.stats.global,
          ...cloudTree.stats.global,
        };
      }
      if (cloudTree.stats.recentMatches && typeof cloudTree.stats.recentMatches === "object") {
        this.tree.stats.recentMatches = {
          ...this.tree.stats.recentMatches,
          ...cloudTree.stats.recentMatches,
        };
      }
      if (cloudTree.stats.leaderboard && typeof cloudTree.stats.leaderboard === "object") {
        this.tree.stats.leaderboard = {
          ...this.tree.stats.leaderboard,
          ...cloudTree.stats.leaderboard,
        };
      }
    }
    if (cloudTree.rooms && typeof cloudTree.rooms === "object") {
      for (const [roomId, room] of Object.entries(cloudTree.rooms)) {
        if (room && typeof room === "object" && room.roomId) {
          this.tree.rooms[roomId] = {
            ...room,
            drops: {
              p1: Array.isArray(room.drops?.p1) ? room.drops.p1.filter(Boolean) : Object.values(room.drops?.p1 ?? {}),
              p2: Array.isArray(room.drops?.p2) ? room.drops.p2.filter(Boolean) : Object.values(room.drops?.p2 ?? {}),
            },
          };
        }
      }
    }
    this.recomputeActiveCounts();
  }

  private recomputeActiveCounts(nowMs = Date.now()): void {
    const rooms = Object.values(this.tree.rooms);
    const activeMatches = rooms.filter(r => r.status === "active" || r.status === "countdown").length;
    const activePlayers = new Set<string>();
    for (const r of rooms) {
      if (r.status === "waiting" || r.status === "countdown" || r.status === "active") {
        if (r.players.p1.connected) activePlayers.add(r.players.p1.id);
        if (r.players.p2?.connected) activePlayers.add(r.players.p2.id);
      }
    }
    this.tree.stats.global = {
      ...this.tree.stats.global,
      onlinePlayers: Math.max(1, activePlayers.size),
      activeMatches,
      updatedAt: nowMs,
    };
  }

  private notifyRoom(roomId: string): void {
    const room = this.tree.rooms[roomId] ? clone(this.tree.rooms[roomId]) : null;
    const listeners = this.roomListeners.get(roomId);
    if (listeners) {
      for (const cb of listeners) cb(room);
    }
  }

  private notifyStats(): void {
    const payload = this.getStatsPayload();
    for (const cb of this.statsListeners) cb(payload);
  }

  getStatsPayload(): { global: PvpGlobalStats; recentMatches: PvpRecentMatch[]; leaderboard: PvpLeaderboardEntry[] } {
    const recentMatches = Object.values(this.tree.stats.recentMatches)
      .sort((a, b) => b.endedAt - a.endedAt)
      .slice(0, 20);
    const leaderboard = Object.values(this.tree.stats.leaderboard)
      .sort((a, b) => b.netCoinsWon - a.netCoinsWon || b.wins - a.wins || b.bestHeight - a.bestHeight)
      .slice(0, 25);
    return {
      global: clone(this.tree.stats.global),
      recentMatches: clone(recentMatches),
      leaderboard: clone(leaderboard),
    };
  }

  getRoom(roomCodeOrId: string): PvpRoomState | null {
    const direct = this.tree.rooms[roomCodeOrId];
    if (direct) return clone(direct);
    const upper = roomCodeOrId.toUpperCase();
    const matches = Object.values(this.tree.rooms)
      .filter(r => r.roomCode === upper)
      .sort((a, b) => Number(a.status === "completed") - Number(b.status === "completed") || b.createdAt - a.createdAt);
    const byCode = matches[0];
    return byCode ? clone(byCode) : null;
  }

  listWaitingRooms(): PvpRoomState[] {
    return Object.values(this.tree.rooms)
      .filter(r => r.status === "waiting" && !r.players.p2)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(r => clone(r));
  }

  createRoom(
    params: {
      totalPot: number;
      building?: BuildingId;
      seed?: number;
      host: { id: string; name: string; coins: number; wins?: number; losses?: number; badge?: string | null; equipment?: RunEquipment };
    },
    nowMs = Date.now(),
  ): { room: PvpRoomState; slot: PvpSlot } {
    const seed = params.seed ?? ((nowMs ^ 0x5f3759df) | 0);
    // Room codes must be unique among live rooms; the seed is client-chosen and
    // correlated with wall-clock time, so it must not drive the code.
    const liveCodes = new Set(
      Object.values(this.tree.rooms)
        .filter(r => r.status !== "completed")
        .map(r => r.roomCode),
    );
    let roomCode = "";
    for (let attempt = 0; attempt < 64 && (!roomCode || liveCodes.has(roomCode)); attempt++) {
      const entropy = typeof crypto !== "undefined" && "getRandomValues" in crypto
        ? crypto.getRandomValues(new Uint32Array(1))[0]
        : Math.floor(Math.random() * 0xffffffff);
      roomCode = generateRoomCode(entropy ^ nowMs ^ attempt);
    }
    const roomId = `room_${roomCode.toLowerCase()}_${nowMs}`;
    const hostBoard = this.tree.stats.leaderboard[params.host.id];
    const room = createPvpRoomState({
      roomId,
      roomCode,
      seed,
      building: params.building ?? "residential",
      totalPot: params.totalPot,
      createdAt: nowMs,
      host: {
        ...params.host,
        wins: params.host.wins ?? hostBoard?.wins ?? 0,
        losses: params.host.losses ?? hostBoard?.losses ?? 0,
      },
    });
    this.tree.rooms[roomId] = room;
    this.recomputeActiveCounts(nowMs);
    this.notifyRoom(roomId);
    this.notifyStats();
    return { room: clone(room), slot: "p1" };
  }

  joinRoom(
    roomCodeOrId: string,
    guest: { id: string; name: string; coins: number; wins?: number; losses?: number; badge?: string | null; equipment?: RunEquipment },
    nowMs = Date.now(),
  ): { room: PvpRoomState; slot: PvpSlot } {
    const target = this.getRoom(roomCodeOrId);
    if (!target) throw new Error("Room not found");
    const guestBoard = this.tree.stats.leaderboard[guest.id];
    const updated = joinPvpRoomState(target, {
      ...guest,
      wins: guest.wins ?? guestBoard?.wins ?? 0,
      losses: guest.losses ?? guestBoard?.losses ?? 0,
    });
    this.tree.rooms[updated.roomId] = updated;
    const slot: PvpSlot = updated.players.p1.id === guest.id ? "p1" : "p2";
    this.recomputeActiveCounts(nowMs);
    this.notifyRoom(updated.roomId);
    this.notifyStats();
    return { room: clone(updated), slot };
  }

  updateTotalPot(roomId: string, totalPot: number, nowMs = Date.now()): PvpRoomState {
    const room = this.tree.rooms[roomId];
    if (!room) throw new Error("Room not found");
    const updated = updateRoomTotalPot(room, totalPot);
    this.tree.rooms[roomId] = updated;
    this.recomputeActiveCounts(nowMs);
    this.notifyRoom(roomId);
    return clone(updated);
  }

  updatePlayerEquipment(
    roomId: string,
    slot: PvpSlot,
    equipment: RunEquipment,
    coins: number,
    activity: PvpPlayerActivity = "lobby",
  ): PvpRoomState {
    const room = this.tree.rooms[roomId];
    if (!room) throw new Error("Room not found");
    const player = room.players[slot];
    if (!player) throw new Error("Player slot is empty");
    const validated = validateRunEquipment(equipment, room.building);
    const updated: PvpRoomState = {
      ...room,
      players: {
        ...room.players,
        [slot]: {
          ...player,
          equipment: validated,
          coins,
          activity,
        },
      },
    };
    this.tree.rooms[roomId] = updated;
    this.notifyRoom(roomId);
    return clone(updated);
  }

  sendEmote(roomId: string, slot: PvpSlot, emote: PvpEmotePayload): PvpRoomState {
    const room = this.tree.rooms[roomId];
    if (!room) throw new Error("Room not found");
    const player = room.players[slot];
    if (!player) throw new Error("Player slot is empty");
    const updated: PvpRoomState = {
      ...room,
      players: {
        ...room.players,
        [slot]: {
          ...player,
          emote: { ...emote },
        },
      },
    };
    this.tree.rooms[roomId] = updated;
    this.notifyRoom(roomId);
    return clone(updated);
  }

  setReady(roomId: string, slot: PvpSlot, ready: boolean, coins: number, nowMs = Date.now()): PvpRoomState {
    const room = this.tree.rooms[roomId];
    if (!room) throw new Error("Room not found");
    const player = room.players[slot];
    if (!player) throw new Error("Player slot is empty");
    const withCoins: PvpRoomState = {
      ...room,
      players: {
        ...room.players,
        [slot]: {
          ...player,
          coins,
        },
      },
    };
    const updated = setPvpPlayerReady(withCoins, slot, ready, nowMs);
    this.tree.rooms[roomId] = updated;
    this.recomputeActiveCounts(nowMs);
    this.notifyRoom(roomId);
    this.notifyStats();
    return clone(updated);
  }

  pushDrop(roomId: string, slot: PvpSlot, drop: DropInput, live: PvpLiveTelemetry): PvpRoomState {
    const room = this.tree.rooms[roomId];
    if (!room) throw new Error("Room not found");
    const existingDrops = room.drops[slot];
    const hasSeq = existingDrops.some(d => d.sequence === drop.sequence);
    const nextDrops = hasSeq ? existingDrops : [...existingDrops, { ...drop }].sort((a, b) => a.sequence - b.sequence);
    const updated: PvpRoomState = {
      ...room,
      drops: {
        ...room.drops,
        [slot]: nextDrops,
      },
      live: {
        ...room.live,
        [slot]: { ...live },
      },
    };
    this.tree.rooms[roomId] = updated;
    this.notifyRoom(roomId);
    return clone(updated);
  }

  pushTelemetry(roomId: string, slot: PvpSlot, live: PvpLiveTelemetry): PvpRoomState {
    const room = this.tree.rooms[roomId];
    if (!room) throw new Error("Room not found");
    const updated: PvpRoomState = {
      ...room,
      live: {
        ...room.live,
        [slot]: { ...live },
      },
    };
    this.tree.rooms[roomId] = updated;
    this.notifyRoom(roomId);
    return clone(updated);
  }

  finishOrResolve(
    roomId: string,
    slot: PvpSlot,
    live: PvpLiveTelemetry,
    forfeitSlot?: PvpSlot,
    nowMs = Date.now(),
  ): PvpMatchResult | null {
    const room = this.tree.rooms[roomId];
    if (!room) throw new Error("Room not found");
    if (room.result) return clone(room.result);

    const updatedLive = {
      ...room.live,
      [slot]: { ...live },
    };
    const nextPlayers = {
      p1: slot === "p1" && live.ended ? { ...room.players.p1, activity: "finished" as const } : room.players.p1,
      p2: room.players.p2
        ? slot === "p2" && live.ended
          ? { ...room.players.p2, activity: "finished" as const }
          : room.players.p2
        : null,
    };

    const candidateRoom: PvpRoomState = {
      ...room,
      players: nextPlayers,
      live: updatedLive,
    };

    const bothDone =
      !!forfeitSlot ||
      ((updatedLive.p1.lives <= 0 || updatedLive.p1.ended) &&
        (updatedLive.p2.lives <= 0 || updatedLive.p2.ended));

    if (!bothDone) {
      this.tree.rooms[roomId] = candidateRoom;
      this.notifyRoom(roomId);
      return null;
    }

    const result = resolvePvpMatchResult(candidateRoom, nowMs, forfeitSlot);
    const completedRoom: PvpRoomState = {
      ...candidateRoom,
      status: "completed",
      result,
    };
    this.tree.rooms[roomId] = completedRoom;

    // Update Firebase RTDB Global Stats, Recent Matches, and Leaderboard
    const p1 = completedRoom.players.p1;
    const p2 = completedRoom.players.p2 ?? {
      id: "guest",
      name: "Opponent",
      coins: 0,
      wins: 0,
      losses: 0,
      badge: null,
      equipment: p1.equipment,
      activity: "finished" as const,
      ready: true,
      stakeLocked: true,
      connected: false,
      emote: null,
    };
    const g = this.tree.stats.global;
    const maxTower = Math.max(g.highestPvpTower, result.p1Summary.height, result.p2Summary.height);
    const floorsBuilt = result.p1Summary.height + result.p2Summary.height;
    this.tree.stats.global = {
      ...g,
      totalMatchesCompleted: g.totalMatchesCompleted + 1,
      totalCoinsWagered: g.totalCoinsWagered + result.totalPot,
      biggestPotWon: result.winnerSlot === "draw" ? g.biggestPotWon : Math.max(g.biggestPotWon, result.totalPot),
      highestPvpTower: maxTower,
      totalFloorsBuiltInPvp: g.totalFloorsBuiltInPvp + floorsBuilt,
      updatedAt: nowMs,
    };

    const matchId = `match_${nowMs}_${completedRoom.roomCode}`;
    this.tree.stats.recentMatches[matchId] = {
      id: matchId,
      roomId: completedRoom.roomId,
      roomCode: completedRoom.roomCode,
      totalPot: result.totalPot,
      winnerSlot: result.winnerSlot,
      reason: result.reason,
      p1: { id: p1.id, name: p1.name, height: result.p1Summary.height, population: result.p1Summary.population },
      p2: { id: p2.id, name: p2.name, height: result.p2Summary.height, population: result.p2Summary.population },
      endedAt: nowMs,
    };

    this.updateLeaderboardEntry(p1.id, p1.name, "p1", result, nowMs);
    this.updateLeaderboardEntry(p2.id, p2.name, "p2", result, nowMs);
    this.recomputeActiveCounts(nowMs);
    this.notifyRoom(roomId);
    this.notifyStats();
    return clone(result);
  }

  private updateLeaderboardEntry(
    playerId: string,
    playerName: string,
    slot: PvpSlot,
    result: PvpMatchResult,
    nowMs: number,
  ): void {
    const existing = this.tree.stats.leaderboard[playerId] ?? {
      id: playerId,
      name: playerName,
      wins: 0,
      losses: 0,
      draws: 0,
      netCoinsWon: 0,
      bestHeight: 0,
      elo: 1200,
      updatedAt: nowMs,
    };
    const isWin = result.winnerSlot === slot;
    const isDraw = result.winnerSlot === "draw";
    const summary = slot === "p1" ? result.p1Summary : result.p2Summary;
    const eloDelta = isDraw ? 0 : isWin ? 24 : -20;
    this.tree.stats.leaderboard[playerId] = {
      ...existing,
      name: playerName || existing.name,
      wins: existing.wins + (isWin ? 1 : 0),
      losses: existing.losses + (!isWin && !isDraw ? 1 : 0),
      draws: existing.draws + (isDraw ? 1 : 0),
      netCoinsWon: existing.netCoinsWon + result.netDelta[slot],
      bestHeight: Math.max(existing.bestHeight, summary.height),
      elo: Math.max(800, existing.elo + eloDelta),
      updatedAt: nowMs,
    };
  }

  subscribeRoom(roomId: string, callback: (room: PvpRoomState | null) => void): () => void {
    let set = this.roomListeners.get(roomId);
    if (!set) {
      set = new Set();
      this.roomListeners.set(roomId, set);
    }
    set.add(callback);
    callback(this.getRoom(roomId));
    return () => {
      set?.delete(callback);
    };
  }

  subscribeStats(
    callback: (data: { global: PvpGlobalStats; recentMatches: PvpRecentMatch[]; leaderboard: PvpLeaderboardEntry[] }) => void,
  ): () => void {
    this.statsListeners.add(callback);
    callback(this.getStatsPayload());
    return () => {
      this.statsListeners.delete(callback);
    };
  }
}

// Singleton server/process engine so API route & local callers share state
const globalForPvp = globalThis as unknown as { __cityBloxxPvpEngine?: InMemoryFirebaseRtdbEngine };
export function getSharedPvpRtdbEngine(): InMemoryFirebaseRtdbEngine {
  if (!globalForPvp.__cityBloxxPvpEngine) {
    globalForPvp.__cityBloxxPvpEngine = new InMemoryFirebaseRtdbEngine();
  }
  return globalForPvp.__cityBloxxPvpEngine;
}

async function mirrorToGoogleFirebaseRtdb(
  path: string,
  data: unknown,
  explicitBaseUrl?: string,
): Promise<void> {
  const baseUrl = explicitBaseUrl?.replace(/\/$/, "");
  if (!baseUrl || typeof fetch !== "function") return;
  try {
    await fetch(`${baseUrl}/cityBloxxPvp/${path}.json`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  } catch {
    // Non-blocking mirror when Firebase RTDB URL is unreachable
  }
}

export function createFirebasePvpPort(options?: {
  apiEndpoint?: string;
  firebaseDatabaseUrl?: string;
  pollIntervalMs?: number;
  engine?: InMemoryFirebaseRtdbEngine;
}): PvpPort {
  const engine = options?.engine ?? getSharedPvpRtdbEngine();
  const apiEndpoint = options?.apiEndpoint ?? "/api/v1/city-bloxx/pvp";
  const pollIntervalMs = options?.pollIntervalMs ?? 250;
  const channel =
    typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("city-bloxx-pvp-rtdb") : null;

  async function callApi<T>(action: string, payload: Record<string, unknown>): Promise<T | null> {
    if (options?.engine || typeof window === "undefined" || typeof fetch !== "function") return null;
    try {
      const res = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  return {
    async createRoom(params) {
      const apiRes = await callApi<{ room: PvpRoomState; slot: PvpSlot }>("createRoom", params);
      const res = apiRes ?? engine.createRoom(params);
      await mirrorToGoogleFirebaseRtdb(`rooms/${res.room.roomId}`, res.room);
      channel?.postMessage({ type: "room", roomId: res.room.roomId });
      return res;
    },
    async joinRoom(roomCodeOrId, guest) {
      const apiRes = await callApi<{ room: PvpRoomState; slot: PvpSlot }>("joinRoom", { roomCodeOrId, guest });
      const res = apiRes ?? engine.joinRoom(roomCodeOrId, guest);
      await mirrorToGoogleFirebaseRtdb(`rooms/${res.room.roomId}`, res.room);
      channel?.postMessage({ type: "room", roomId: res.room.roomId });
      return res;
    },
    async listWaitingRooms() {
      const apiRes = await callApi<{ rooms: PvpRoomState[] }>("listWaitingRooms", {});
      return apiRes?.rooms ?? engine.listWaitingRooms();
    },
    async updateTotalPot(roomId, totalPot) {
      const apiRes = await callApi<{ room: PvpRoomState }>("updateTotalPot", { roomId, totalPot });
      const room = apiRes?.room ?? engine.updateTotalPot(roomId, totalPot);
      await mirrorToGoogleFirebaseRtdb(`rooms/${roomId}`, room);
      channel?.postMessage({ type: "room", roomId });
      return room;
    },
    async updatePlayerEquipment(roomId, slot, equipment, coins, activity) {
      const apiRes = await callApi<{ room: PvpRoomState }>("updatePlayerEquipment", {
        roomId,
        slot,
        equipment,
        coins,
        activity,
      });
      const room = apiRes?.room ?? engine.updatePlayerEquipment(roomId, slot, equipment, coins, activity);
      await mirrorToGoogleFirebaseRtdb(`rooms/${roomId}/players/${slot}`, room.players[slot]);
      channel?.postMessage({ type: "room", roomId });
      return room;
    },
    async sendEmote(roomId, slot, emote) {
      await callApi("sendEmote", { roomId, slot, emote });
      const room = engine.getRoom(roomId) ? engine.sendEmote(roomId, slot, emote) : null;
      if (room) await mirrorToGoogleFirebaseRtdb(`rooms/${roomId}/players/${slot}/emote`, emote);
      channel?.postMessage({ type: "room", roomId });
    },
    async setReady(roomId, slot, ready, coins) {
      const apiRes = await callApi<{ room: PvpRoomState }>("setReady", { roomId, slot, ready, coins });
      const room = apiRes?.room ?? engine.setReady(roomId, slot, ready, coins);
      await mirrorToGoogleFirebaseRtdb(`rooms/${roomId}`, room);
      channel?.postMessage({ type: "room", roomId });
      return room;
    },
    async pushDrop(roomId, slot, drop, live) {
      await callApi("pushDrop", { roomId, slot, drop, live });
      if (engine.getRoom(roomId)) engine.pushDrop(roomId, slot, drop, live);
      await mirrorToGoogleFirebaseRtdb(`rooms/${roomId}/drops/${slot}/${drop.sequence}`, drop);
      await mirrorToGoogleFirebaseRtdb(`rooms/${roomId}/live/${slot}`, live);
      channel?.postMessage({ type: "room", roomId });
    },
    async pushTelemetry(roomId, slot, live) {
      await callApi("pushTelemetry", { roomId, slot, live });
      if (engine.getRoom(roomId)) engine.pushTelemetry(roomId, slot, live);
      await mirrorToGoogleFirebaseRtdb(`rooms/${roomId}/live/${slot}`, live);
      channel?.postMessage({ type: "room", roomId });
    },
    async finishOrResolve(roomId, slot, live, forfeitSlot) {
      const apiRes = await callApi<{ result: PvpMatchResult | null }>("finishOrResolve", {
        roomId,
        slot,
        live,
        forfeitSlot,
      });
      const result =
        apiRes !== null
          ? apiRes.result
          : engine.getRoom(roomId)
            ? engine.finishOrResolve(roomId, slot, live, forfeitSlot)
            : null;
      if (result) {
        await mirrorToGoogleFirebaseRtdb(`rooms/${roomId}/result`, result);
        await mirrorToGoogleFirebaseRtdb(`stats`, engine.getStatsPayload());
      }
      channel?.postMessage({ type: "room", roomId });
      return result;
    },
    subscribeRoom(roomId, callback) {
      // In API mode the room lives on the server; the browser-local engine does not
      // know it and would emit `null` immediately, which the UI treats as "room closed".
      const apiMode = !options?.engine && typeof window !== "undefined";
      const unsubLocal = engine.subscribeRoom(roomId, room => {
        if (room || !apiMode) callback(room);
      });
      let timer: ReturnType<typeof setInterval> | null = null;
      const pull = async () => {
        const apiRes = await callApi<{ room: PvpRoomState | null }>("getRoom", { roomCodeOrId: roomId });
        if (apiRes) callback(apiRes.room ?? null);
      };
      if (apiMode) {
        void pull();
        timer = setInterval(() => {
          void pull();
        }, pollIntervalMs);
      }
      const onMsg = (ev: MessageEvent) => {
        if (ev.data?.roomId === roomId) void pull();
      };
      channel?.addEventListener("message", onMsg);
      return () => {
        unsubLocal();
        if (timer) clearInterval(timer);
        channel?.removeEventListener("message", onMsg);
      };
    },
    subscribeStats(callback) {
      const unsubLocal = engine.subscribeStats(callback);
      let timer: ReturnType<typeof setInterval> | null = null;
      const pull = async () => {
        const apiRes = await callApi<{
          global: PvpGlobalStats;
          recentMatches: PvpRecentMatch[];
          leaderboard: PvpLeaderboardEntry[];
        }>("getStats", {});
        if (apiRes?.global) callback(apiRes);
      };
      if (!options?.engine && typeof window !== "undefined") {
        void pull();
        timer = setInterval(() => {
          void pull();
        }, pollIntervalMs * 2);
      }
      return () => {
        unsubLocal();
        if (timer) clearInterval(timer);
      };
    },
  };
}
