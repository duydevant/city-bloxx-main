import { COSMETIC_CATALOG } from "../../city-bloxx-content/cosmetics";
import {
  createOpponentReplicaGame,
  equipmentFor,
  extractLiveTelemetryFromSnapshot,
  lockPvpStake,
  PVP_EMOTES,
  PVP_PRESET_POTS,
  QuickTowerGame,
  refundPvpStake,
  settlePvpWager,
  syncOpponentReplica,
  validateTotalPot,
  type BuildingId,
  type GameSave,
  type PvpPort,
  type PvpRoomState,
  type PvpSlot,
  type RunEquipment,
} from "../../city-bloxx-core/src/index";
import { QuickTowerRenderer } from "./index";
import { lucideSvg } from "./lucide-icons";
import { bigButton, formatNumber, icon, node, pill, roundButton } from "./ui-kit";

export interface PvpScreensDeps {
  arena: HTMLElement;
  panel: HTMLElement;
  renderer: QuickTowerRenderer;
  assets: string;
  pvp?: PvpPort;
  save: () => GameSave;
  updateSave: (next: GameSave) => void;
  vi: () => boolean;
  now: () => number;
  installationId: () => string;
  showPanel: (title: string, body: string, actions: HTMLButtonElement[]) => void;
  screen: (title: string, className: string) => HTMLElement;
  button: (label: string, action: () => void) => HTMLButtonElement;
  home: () => void;
  openBook: () => void;
  startPvpRun: (room: PvpRoomState, slot: PvpSlot) => Promise<void>;
  message: (text: string) => void;
}

export interface PvpScreensController {
  openLobby: (initialRoomCode?: string) => void;
  isOpen: () => boolean;
  isInActiveMatch: () => boolean;
  clear: () => void;
  refresh: () => void;
  onLocalFrame: (game: QuickTowerGame) => void;
  onLocalEnded: (game: QuickTowerGame) => void;
  dispose: () => void;
}

function cosmeticName(id: string, vi: boolean): string {
  const found = COSMETIC_CATALOG.find(item => item.id === id);
  return found ? (vi ? found.title.vi : found.title.en) : id;
}

function canAffordPot(totalPot: number, coins: number): { valid: boolean; stakePerPlayer: number } {
  try {
    const res = validateTotalPot(totalPot, coins);
    return { valid: true, stakePerPlayer: res.stakePerPlayer };
  } catch {
    return { valid: false, stakePerPlayer: Math.max(10, Math.floor(totalPot / 2)) };
  }
}

export function createPvpScreens(deps: PvpScreensDeps): PvpScreensController {
  let openMode: "none" | "entry" | "room" | "result" = "none";
  let selectedPot = 200;
  let customPotInput = "";
  let joinCodeInput = "";
  let currentRoom: PvpRoomState | null = null;
  let currentSlot: PvpSlot = "p1";
  let unsubscribeRoom: (() => void) | null = null;
  let unsubscribeStats: (() => void) | null = null;
  let waitingRooms: PvpRoomState[] = [];
  let onlinePlayersCount = 1;
  let activeMatchRoomId: string | null = null;
  let settledMatchRoomId: string | null = null;
  let lastBroadcastTick = -1;
  let lastDropCountSent = 0;
  let localFinishSubmitted = false;
  let botTimer = 0;
  let botRoomId: string | null = null;
  let botGame: QuickTowerGame | null = null;
  let botNextDropTick = 45;
  let botDropsSent = 0;

  // Live overlay & secondary opponent renderer inside arena
  const liveOverlay = document.createElement("div");
  liveOverlay.className = "cb-pvp-live-overlay";
  liveOverlay.dataset.pvpMatchOverlay = "true";
  liveOverlay.hidden = true;
  liveOverlay.innerHTML = `
    <div class="cb-pvp-vs-bar" data-pvp-vs-bar>
      <div class="cb-pvp-vs-side" data-pvp-vs-p1>
        <strong data-pvp-p1-name>P1</strong>
        <span data-pvp-p1-stats>0F · 3/3 HP</span>
      </div>
      <div class="cb-pvp-vs-pot" data-pvp-vs-pot>${lucideSvg("coins", 14)} <span>200</span></div>
      <div class="cb-pvp-vs-side" data-pvp-vs-p2>
        <strong data-pvp-p2-name>P2</strong>
        <span data-pvp-p2-stats>0F · 3/3 HP</span>
      </div>
    </div>
    <div class="cb-pvp-event-banner" data-pvp-live-event hidden></div>
    <div class="cb-pvp-pip" data-pvp-pip>
      <div class="cb-pvp-pip-header">
        <span data-pvp-pip-title>LIVE OPPONENT</span>
        <span data-pvp-pip-badge>0F</span>
      </div>
      <canvas data-pvp-opponent-canvas width="180" height="230" aria-label="Opponent live tower"></canvas>
      <div class="cb-pvp-spectator-note" data-pvp-spectator-note hidden></div>
    </div>
  `;
  deps.arena.append(liveOverlay);

  const oppCanvas = liveOverlay.querySelector<HTMLCanvasElement>("[data-pvp-opponent-canvas]")!;
  const oppRenderer = new QuickTowerRenderer(oppCanvas, deps.assets);
  let oppRendererLoaded = false;
  let oppReplicaGame: QuickTowerGame | null = null;
  let oppLoadedEquipmentKey = "";
  let lastOppEventSeq = -1;

  function ensureOppRendererLoaded(building: BuildingId, equipment: RunEquipment): void {
    const eqKey = `${building}:${equipment.building}:${equipment.roof}:${equipment.crane}`;
    if (!oppRendererLoaded) {
      oppRendererLoaded = true;
      void oppRenderer.load().then(() => oppRenderer.loadEquipment(building, equipment)).catch(() => {});
    } else if (oppLoadedEquipmentKey !== eqKey) {
      oppLoadedEquipmentKey = eqKey;
      void oppRenderer.loadEquipment(building, equipment).catch(() => {});
    }
    oppRenderer.setLocale(deps.vi() ? "vi" : "en");
    oppRenderer.setEquipment(equipment);
  }

  function wt(en: string, viText: string): string {
    return deps.vi() ? viText : en;
  }

  // Pin one identity per tab (survives reload, distinct across tabs): the Web
  // installationId() provider may return a fresh random value on each call.
  const TAB_ID_KEY = "city-bloxx.pvp.tab-id";
  let pinnedInstallationId: string | null = null;
  function stableInstallationId(): string {
    if (pinnedInstallationId) return pinnedInstallationId;
    try {
      pinnedInstallationId = window.sessionStorage.getItem(TAB_ID_KEY);
    } catch {
      pinnedInstallationId = null;
    }
    if (!pinnedInstallationId) {
      pinnedInstallationId = deps.installationId();
      try {
        window.sessionStorage.setItem(TAB_ID_KEY, pinnedInstallationId);
      } catch {
        // Storage unavailable: identity stays pinned for this page lifetime.
      }
    }
    return pinnedInstallationId;
  }

  /** Mirror the active room code into the URL so reload/share lands back in the room. */
  function syncRoomUrl(roomCode: string | null): void {
    try {
      const url = new URL(window.location.href);
      if (roomCode) {
        url.searchParams.set("screen", "pvp");
        url.searchParams.set("room", roomCode);
      } else {
        url.searchParams.delete("room");
      }
      if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url.href);
    } catch {
      // Non-browser or sandboxed embed: URL sync is best-effort only.
    }
  }

  function localPlayerId(): string {
    return `pvp-${stableInstallationId().slice(0, 12)}`;
  }

  function localPlayerName(): string {
    const id = stableInstallationId().slice(0, 4).toUpperCase();
    return `Builder #${id}`;
  }

  function localEquipment(): RunEquipment {
    return equipmentFor(deps.save(), "residential");
  }

  function stopBot(): void {
    if (botTimer) {
      window.clearInterval(botTimer);
      botTimer = 0;
    }
    botRoomId = null;
    botGame = null;
    botDropsSent = 0;
  }

  function disconnectRoomSubscription(): void {
    if (unsubscribeRoom) {
      unsubscribeRoom();
      unsubscribeRoom = null;
    }
  }

  function hideLiveOverlay(): void {
    liveOverlay.hidden = true;
    delete liveOverlay.dataset.pvpSpectator;
    deps.renderer.setOpponentTower(null);
  }

  function clear(): void {
    openMode = "none";
    delete deps.panel.dataset.pvpScreen;
    deps.panel.classList.remove("cb-pvp-panel", "cb-pvp-screen");
  }

  function leaveCurrentRoom(refundIfLocked = true): void {
    stopBot();
    disconnectRoomSubscription();
    if (currentRoom && refundIfLocked && currentRoom.status === "waiting") {
      const me = currentRoom.players[currentSlot];
      if (me?.stakeLocked) {
        const refunded = refundPvpStake(deps.save(), currentRoom.roomId, currentRoom.stakePerPlayer);
        deps.updateSave(refunded);
      }
    }
    currentRoom = null;
    activeMatchRoomId = null;
    syncRoomUrl(null);
    hideLiveOverlay();
  }

  function subscribeToRoom(roomId: string): void {
    disconnectRoomSubscription();
    if (!deps.pvp) return;
    unsubscribeRoom = deps.pvp.subscribeRoom(roomId, room => {
      if (!room) {
        deps.message(wt("Room was closed.", "Phòng đã đóng."));
        currentRoom = null;
        activeMatchRoomId = null;
        hideLiveOverlay();
        openLobby();
        return;
      }
      const prevStatus = currentRoom?.status;
      currentRoom = room;
      if (room.players.p2?.id === localPlayerId()) currentSlot = "p2";
      else if (room.players.p1.id === localPlayerId()) currentSlot = "p1";

      // If host changed totalPot and reset ready/stakeLocked while we had locked stake, refund locally until we re-lock
      if (room.status === "waiting" && !room.players[currentSlot]?.stakeLocked) {
        const refunded = refundPvpStake(deps.save(), room.roomId, room.stakePerPlayer);
        if (refunded !== deps.save()) deps.updateSave(refunded);
      }

      // If match transitions to countdown or active, launch the synchronized 1v1 run!
      if ((room.status === "countdown" || room.status === "active") && activeMatchRoomId !== room.roomId) {
        activeMatchRoomId = room.roomId;
        settledMatchRoomId = null;
        lastBroadcastTick = -1;
        lastDropCountSent = 0;
        localFinishSubmitted = false;
        oppReplicaGame = createOpponentReplicaGame(room.seed, room.building);
        lastOppEventSeq = -1;
        clear();
        void deps.startPvpRun(room, currentSlot);
        updateLiveOverlayUi();
        return;
      }

      if (room.status === "completed") {
        settleCompletedMatch(room);
        if (openMode !== "result" || prevStatus !== "completed") {
          renderResultScreen(room);
        }
        return;
      }

      if (activeMatchRoomId === room.roomId) {
        updateLiveOverlayUi();
      } else if (openMode === "room") {
        renderRoomScreen();
      }
    });
  }

  function settleCompletedMatch(room: PvpRoomState): void {
    if (!room.result || settledMatchRoomId === room.roomId) return;
    settledMatchRoomId = room.roomId;
    const nextSave = settlePvpWager(deps.save(), room.roomId, currentSlot, room.result);
    deps.updateSave(nextSave);
  }

  function updateLiveOverlayUi(): void {
    if (!currentRoom || !activeMatchRoomId || currentRoom.status === "waiting") {
      hideLiveOverlay();
      return;
    }
    liveOverlay.hidden = false;
    const oppSlot: PvpSlot = currentSlot === "p1" ? "p2" : "p1";
    const oppPlayer = currentRoom.players[oppSlot];
    const meLive = currentRoom.live[currentSlot];
    const oppLive = currentRoom.live[oppSlot];

    const p1NameEl = liveOverlay.querySelector<HTMLElement>("[data-pvp-p1-name]");
    const p1StatsEl = liveOverlay.querySelector<HTMLElement>("[data-pvp-p1-stats]");
    const p2NameEl = liveOverlay.querySelector<HTMLElement>("[data-pvp-p2-name]");
    const p2StatsEl = liveOverlay.querySelector<HTMLElement>("[data-pvp-p2-stats]");
    const potEl = liveOverlay.querySelector<HTMLElement>("[data-pvp-vs-pot]");

    const p1 = currentRoom.players.p1;
    const p2 = currentRoom.players.p2;
    const l1 = currentRoom.live.p1;
    const l2 = currentRoom.live.p2;
    const hearts = (n: number) => `${Math.max(0, n)}/3 HP`;

    if (p1NameEl) p1NameEl.textContent = `${p1.name}${currentSlot === "p1" ? ` (${wt("You", "Bạn")})` : ""}`;
    if (p1StatsEl) p1StatsEl.textContent = `${l1.height}F · ${hearts(l1.lives)}${l1.ended ? ` · ${wt("Done", "Xong")}` : ""}`;
    if (p2NameEl) p2NameEl.textContent = `${p2?.name ?? "P2"}${currentSlot === "p2" ? ` (${wt("You", "Bạn")})` : ""}`;
    if (p2StatsEl) p2StatsEl.textContent = `${l2.height}F · ${hearts(l2.lives)}${l2.ended ? ` · ${wt("Done", "Xong")}` : ""}`;
    if (potEl) potEl.innerHTML = `${lucideSvg("coins", 14)} <span>POT ${currentRoom.totalPot}</span>`;

    // Update main canvas opponent height horizon line
    const oppHeight = oppLive.height;
    deps.renderer.setOpponentTower({
      height: oppHeight,
      label: `VS ${oppPlayer?.name ?? wt("OPPONENT", "ĐỐI THỦ")}`,
    });

    // Update event banner if opponent landed/missed a new block
    const oppDrops = currentRoom.drops[oppSlot] ?? [];
    const bannerEl = liveOverlay.querySelector<HTMLElement>("[data-pvp-live-event]");
    if (bannerEl) {
      if (oppDrops.length > 0) {
        const latest = oppDrops[oppDrops.length - 1];
        if (latest.sequence !== lastOppEventSeq) {
          lastOppEventSeq = latest.sequence;
          bannerEl.hidden = false;
          if (oppLive.lastPlacement === "miss") {
            bannerEl.innerHTML = `${lucideSvg("alert-triangle", 14)} <span>${oppPlayer?.name ?? "Opponent"} ${wt("MISSED!", "TRƯỢT KHỐI!")} (${oppLive.lives}/3 HP)</span>`;
            bannerEl.dataset.eventType = "miss";
          } else if (oppLive.lastPlacement === "perfect") {
            bannerEl.innerHTML = `${lucideSvg("zap", 14)} <span>${oppPlayer?.name ?? "Opponent"} PERFECT! (${oppLive.height}F)</span>`;
            bannerEl.dataset.eventType = "perfect";
          } else {
            bannerEl.innerHTML = `${lucideSvg("layers", 14)} <span>${oppPlayer?.name ?? "Opponent"} +1F (${oppLive.height}F)</span>`;
            bannerEl.dataset.eventType = "good";
          }
        }
      } else {
        bannerEl.hidden = true;
      }
    }

    // Update opponent replica mini-canvas
    const pipTitle = liveOverlay.querySelector<HTMLElement>("[data-pvp-pip-title]");
    const pipBadge = liveOverlay.querySelector<HTMLElement>("[data-pvp-pip-badge]");
    if (pipTitle) pipTitle.innerHTML = `${lucideSvg("eye", 12)} <span>${oppPlayer?.name ?? wt("Opponent", "Đối thủ")}</span>`;
    if (pipBadge) pipBadge.textContent = `${oppLive.height}F · ${hearts(oppLive.lives)}`;

    if (oppPlayer) {
      ensureOppRendererLoaded(currentRoom.building, oppPlayer.equipment);
    }
    if (!oppReplicaGame || oppReplicaGame.config.seed !== currentRoom.seed) {
      oppReplicaGame = createOpponentReplicaGame(currentRoom.seed, currentRoom.building);
    }
    const targetTick = Math.max(oppLive.tick, meLive.tick);
    const snap = syncOpponentReplica(oppReplicaGame, oppDrops, targetTick);
    const isSpectator = liveOverlay.dataset.pvpSpectator === "true";
    oppRenderer.resize(isSpectator ? 260 : 140, isSpectator ? 240 : 175, 1);
    oppRenderer.render(snap, undefined, 1, false);
  }

  function startBotOpponent(room: PvpRoomState): void {
    stopBot();
    if (!deps.pvp) return;
    const botId = `bot-${room.roomId.toLowerCase()}`;
    const botEq: RunEquipment = {
      building: "brick-building-residential",
      roof: "winter-roof-residential",
      crane: "brick-crane",
    };
    botRoomId = room.roomId;
    botGame = createOpponentReplicaGame(room.seed, room.building);
    botNextDropTick = 42;
    botDropsSent = 0;

    void (async () => {
      if (!deps.pvp || botRoomId !== room.roomId) return;
      const joined = await deps.pvp.joinRoom(room.roomCode, {
        id: botId,
        name: wt("Skyline Bot", "Bot Kiến Trúc"),
        coins: Math.max(2000, room.totalPot),
        wins: 12,
        losses: 5,
        equipment: botEq,
      });
      if (!joined || botRoomId !== room.roomId) return;
      await deps.pvp.sendEmote(room.roomId, "p2", {
        id: "wave",
        text: wt("Hello!", "Chào bạn!"),
        sentAt: deps.now(),
      });
      await deps.pvp.setReady(room.roomId, "p2", true, Math.max(2000, room.totalPot));
    })();

    botTimer = window.setInterval(() => {
      if (!deps.pvp || !currentRoom || currentRoom.roomId !== room.roomId) {
        stopBot();
        return;
      }
      if (currentRoom.status !== "countdown" && currentRoom.status !== "active") return;
      if (!botGame) botGame = createOpponentReplicaGame(currentRoom.seed, currentRoom.building);

      if (botGame.getPhase() !== "ended") {
        for (let i = 0; i < 12; i++) {
          if (botGame.getPhase() === "ended") break;
          const snap = botGame.getSnapshot();
          if (snap.phase === "swing" && snap.tick >= botNextDropTick) {
            const targetFloorsBeforeMiss = 6 + (Math.abs(currentRoom.seed) % 5);
            const nearCenter = Math.abs(snap.current.x) < 28;
            const forceMiss = snap.floors.length >= targetFloorsBeforeMiss && Math.abs(snap.current.x) > 120;
            if (nearCenter || forceMiss || snap.tick - botNextDropTick > 55) {
              if (botGame.drop(1)) {
                const recInputs = botGame.getInputs();
                const latestInput = recInputs[recInputs.length - 1];
                const afterSnap = botGame.getSnapshot();
                if (latestInput) {
                  void deps.pvp.pushDrop(
                    room.roomId,
                    "p2",
                    latestInput,
                    extractLiveTelemetryFromSnapshot(afterSnap, deps.now()),
                  );
                }
                botDropsSent = recInputs.length;
                botNextDropTick = snap.tick + 42 + ((botDropsSent * 17) % 25);
              }
            }
          }
          botGame.advanceTicks(1);
        }
        const liveSnap = botGame.getSnapshot();
        const telemetry = extractLiveTelemetryFromSnapshot(liveSnap, deps.now());
        void deps.pvp.pushTelemetry(room.roomId, "p2", telemetry);
        if (liveSnap.phase === "ended") {
          void deps.pvp.finishOrResolve(room.roomId, "p2", telemetry);
        }
      }
    }, 200);
  }

  function refreshWaitingRooms(): void {
    if (!deps.pvp) return;
    if (deps.pvp.listWaitingRooms) {
      void deps.pvp.listWaitingRooms().then(rooms => {
        waitingRooms = rooms;
        if (openMode === "entry") renderEntryScreen();
      }).catch(() => {});
    }
    if (!unsubscribeStats && deps.pvp.subscribeStats) {
      unsubscribeStats = deps.pvp.subscribeStats(data => {
        onlinePlayersCount = data.global.onlinePlayers;
        if (openMode === "entry") {
          const onlineEl = deps.panel.querySelector<HTMLElement>("[data-pvp-online-count]");
          if (onlineEl) onlineEl.textContent = String(onlinePlayersCount);
        }
      });
    }
  }

  function createRoomAndEnter(withBot: boolean): void {
    if (!deps.pvp) return;
    const check = canAffordPot(selectedPot, deps.save().coins);
    if (!check.valid) {
      deps.message(wt(`Need at least ${check.stakePerPlayer} Coins for a ${selectedPot} Pot.`, `Cần tối thiểu ${check.stakePerPlayer} Xu cho tổng cược ${selectedPot}.`));
      return;
    }
    void deps.pvp
      .createRoom({
        totalPot: selectedPot,
        seed: (deps.now() & 0x7fffffff) || (withBot ? 54321 : 12345),
        host: { id: localPlayerId(), name: localPlayerName(), coins: deps.save().coins, equipment: localEquipment() },
      })
      .then(({ room, slot }) => {
        currentRoom = room;
        currentSlot = slot;
        syncRoomUrl(room.roomCode);
        subscribeToRoom(room.roomId);
        renderRoomScreen();
        if (withBot) startBotOpponent(room);
      });
  }

  /** Big colored mode card: the bot match and the private room must never look alike. */
  function modeCard(kind: "bot" | "room", title: string, sub: string, disabled: boolean, action: () => void): HTMLButtonElement {
    const card = node("button", "cb-pvp-mode");
    card.type = "button";
    card.dataset.mode = kind;
    card.disabled = disabled;
    const chip = node("span", "cb-pvp-mode-icon");
    chip.innerHTML = lucideSvg(kind === "bot" ? "bot" : "users", 30);
    const copy = node("span", "cb-pvp-mode-copy");
    copy.append(node("strong", "", title), node("small", "", sub));
    const go = node("span", "cb-pvp-mode-go");
    go.innerHTML = lucideSvg(kind === "bot" ? "zap" : "plus", 22);
    card.append(chip, copy, go);
    card.addEventListener("click", action);
    return card;
  }

  function renderEntryScreen(): void {
    const save = deps.save();
    const vi = deps.vi();
    const potCheck = canAffordPot(selectedPot, save.coins);
    deps.screen(wt("Solo PvP 1v1 · Coin Wager", "Đấu Solo PvP 1v1 · Cược Xu"), "cb-pvp-screen");
    deps.panel.classList.add("cb-pvp-panel");
    deps.panel.dataset.pvpScreen = "entry";
    openMode = "entry"; // screen() calls clear(), which resets openMode

    const wrap = node("div", "cb-pvp");
    const top = node("div", "cb-top");
    const back = roundButton("chevron-left", wt("Home", "Trang chủ"), () => { clear(); deps.home(); });
    const wallet = pill("coins", formatNumber(save.coins, vi), wt("Coins", "Xu"), "cb-coin-chip");
    wallet.dataset.pvpWallet = "true";
    const right = node("div", "cb-top-group");
    const online = pill("users", String(onlinePlayersCount), "Online", "cb-online-chip");
    online.querySelector("strong")!.dataset.pvpOnlineCount = "true";
    const stats = node("a", "cb-round-btn cb-round-link");
    stats.href = "/pvp"; stats.dataset.pvpDashboardLink = "true";
    stats.innerHTML = lucideSvg("bar-chart-3", 22);
    stats.setAttribute("aria-label", wt("Live stats", "Thống kê trực tiếp")); stats.title = stats.getAttribute("aria-label")!;
    right.append(online, stats);
    top.append(back, wallet, right);

    const hero = node("div", "cb-pvp-hero");
    hero.append(node("strong", "cb-pvp-hero-vs", "1 VS 1"), node("p", "cb-pvp-hero-sub", wt("Higher tower takes the pot", "Tháp cao hơn ăn trọn pot")));

    const potCard = node("section", "cb-pvp-pot");
    const potHead = node("div", "cb-pvp-pot-head");
    const potValue = node("span", "cb-pvp-pot-value");
    potValue.append(icon("coins", 26), node("strong", "", formatNumber(selectedPot, vi)));
    const each = node("small", "", wt(`${formatNumber(Math.floor(selectedPot / 2), vi)} each`, `Mỗi người ${formatNumber(Math.floor(selectedPot / 2), vi)}`));
    potHead.append(potValue, each);
    const potRow = node("div", "cb-pvp-pot-row");
    for (const preset of PVP_PRESET_POTS) {
      const b = node("button", "cb-chip", formatNumber(preset, vi));
      b.type = "button";
      b.dataset.pvpPot = String(preset);
      b.setAttribute("aria-pressed", String(selectedPot === preset));
      b.disabled = !canAffordPot(preset, save.coins).valid;
      b.addEventListener("click", () => { selectedPot = preset; customPotInput = String(preset); renderEntryScreen(); });
      potRow.append(b);
    }
    const customInput = node("input", "cb-pvp-input cb-pvp-custom");
    customInput.type = "number"; customInput.min = "20"; customInput.step = "20"; customInput.inputMode = "numeric";
    customInput.placeholder = wt("Other", "Khác");
    customInput.setAttribute("aria-label", wt("Custom pot (even)", "Tổng cược tùy chọn (số chẵn)"));
    customInput.dataset.pvpCustomPot = "true";
    customInput.value = PVP_PRESET_POTS.includes(selectedPot as typeof PVP_PRESET_POTS[number]) ? "" : customPotInput;
    customInput.addEventListener("change", () => {
      customPotInput = customInput.value;
      const parsed = Number(customInput.value);
      if (Number.isFinite(parsed) && parsed >= 20) { selectedPot = Math.floor(parsed / 2) * 2; renderEntryScreen(); }
    });
    potRow.append(customInput);
    potCard.append(potHead, potRow);
    if (!potCheck.valid) potCard.append(node("p", "cb-pvp-warn", wt(`Not enough coins · need ${potCheck.stakePerPlayer}`, `Không đủ xu · cần ${potCheck.stakePerPlayer}`)));

    const modes = node("div", "cb-pvp-modes");
    const botBtn = modeCard("bot", wt("Play bot now", "Đấu Bot ngay"), wt("Instant match", "Vào trận ngay"), !potCheck.valid, () => createRoomAndEnter(true));
    botBtn.dataset.pvpBot = "true";
    const createBtn = modeCard("room", wt("Create room", "Tạo phòng"), wt("Invite with a code", "Mời bạn bằng mã"), !potCheck.valid, () => createRoomAndEnter(false));
    createBtn.dataset.pvpCreate = "true";
    modes.append(botBtn, createBtn);

    const joinCard = node("section", "cb-pvp-join");
    const joinRow = node("div", "cb-pvp-join-row");
    const codeInput = node("input", "cb-pvp-input cb-pvp-code");
    codeInput.type = "text"; codeInput.maxLength = 12; codeInput.autocomplete = "off";
    codeInput.placeholder = wt("Room code", "Mã phòng");
    codeInput.setAttribute("aria-label", wt("Room code", "Mã phòng"));
    codeInput.dataset.pvpJoinInput = "true";
    codeInput.value = joinCodeInput;
    codeInput.addEventListener("input", () => { joinCodeInput = codeInput.value.toUpperCase().trim(); codeInput.value = joinCodeInput; });
    codeInput.addEventListener("keydown", event => { if (event.key === "Enter" && joinCodeInput) void joinRoomByCode(joinCodeInput); });
    const joinBtn = roundButton("chevron-right", wt("Join room", "Vào phòng"), () => { if (deps.pvp && joinCodeInput) void joinRoomByCode(joinCodeInput); }, "cb-pvp-join-btn");
    joinBtn.dataset.pvpJoinBtn = "true";
    joinRow.append(codeInput, joinBtn);
    joinCard.append(joinRow);

    const roomList = node("div", "cb-pvp-room-list");
    roomList.dataset.pvpRoomList = "true";
    if (waitingRooms.length === 0) {
      const empty = node("p", "cb-pvp-empty");
      empty.append(icon("timer", 16), node("span", "", wt("No open rooms yet", "Chưa có phòng chờ")));
      roomList.append(empty);
    } else {
      for (const item of waitingRooms.slice(0, 4)) {
        const isOwnRoom = item.players.p1.id === localPlayerId();
        const row = node("button", "cb-pvp-room-item");
        row.type = "button";
        if (isOwnRoom) row.dataset.pvpOwnRoom = item.roomCode; else row.dataset.pvpJoinRoom = item.roomCode;
        const avatar = node("span", "cb-pvp-avatar", item.players.p1.name.replace(/^Builder #/, "").slice(0, 2));
        const who = node("span", "cb-pvp-room-who");
        who.append(node("strong", "", isOwnRoom ? wt("Your room", "Phòng của bạn") : item.players.p1.name), node("small", "", `#${item.roomCode}`));
        const pot = node("span", "cb-pvp-room-pot");
        pot.append(icon("coins", 16), node("strong", "", formatNumber(item.totalPot, vi)));
        const go = icon(isOwnRoom ? "rotate-ccw" : "chevron-right", 20, "cb-pvp-room-go");
        row.setAttribute("aria-label", `${isOwnRoom ? wt("Back to my room", "Về phòng của tôi") : wt("Join", "Vào")} #${item.roomCode} · ${item.totalPot}`);
        row.append(avatar, who, pot, go);
        row.addEventListener("click", () => { void joinRoomByCode(item.roomCode); });
        roomList.append(row);
      }
    }
    joinCard.append(roomList);

    const skins = node("button", "cb-pvp-skin-link");
    skins.type = "button";
    skins.append(icon("palette", 18), node("span", "", wt("Skins", "Skin")));
    skins.addEventListener("click", () => { clear(); deps.openBook(); });

    wrap.append(top, hero, potCard, modes, joinCard, skins);
    deps.panel.append(wrap);
  }
  async function joinRoomByCode(code: string): Promise<void> {
    if (!deps.pvp) return;
    const normalized = code.trim().toUpperCase();
    if (!normalized) return;
    try {
      const { room, slot } = await deps.pvp.joinRoom(normalized, {
        id: localPlayerId(),
        name: localPlayerName(),
        coins: deps.save().coins,
        equipment: localEquipment(),
      });
      if (deps.save().coins < room.stakePerPlayer && slot === "p2") {
        deps.message(
          wt(
            `Joined room #${room.roomCode}, but you need ${room.stakePerPlayer} Coins to lock stake.`,
            `Đã vào phòng #${room.roomCode}, nhưng bạn cần ${room.stakePerPlayer} Xu để khóa cược.`,
          ),
        );
      }
      currentRoom = room;
      currentSlot = slot;
      syncRoomUrl(room.roomCode);
      subscribeToRoom(room.roomId);
      renderRoomScreen();
    } catch {
      syncRoomUrl(null);
      deps.message(wt(`Could not join room ${normalized} (not found or full).`, `Không thể vào phòng ${normalized} (không tồn tại hoặc đã đầy).`));
    }
  }

  function renderPlayerLobbyCard(slot: PvpSlot, room: PvpRoomState): HTMLElement {
    const player = room.players[slot];
    const vi = deps.vi();
    const card = node("article", "cb-pvp-player");
    card.dataset.pvpPlayerCard = slot;

    if (!player) {
      card.dataset.empty = "true";
      const waiting = node("div", "cb-pvp-waiting");
      waiting.append(icon("timer", 28), node("small", "", wt("Waiting…", "Đang chờ…")));
      const code = node("strong", "cb-pvp-waiting-code", room.roomCode);
      const botFillBtn = node("button", "cb-pvp-bot-fill");
      botFillBtn.type = "button";
      botFillBtn.append(icon("bot", 18), node("span", "", wt("Add bot", "Gọi Bot")));
      botFillBtn.dataset.pvpSpawnBot = "true";
      botFillBtn.addEventListener("click", () => { startBotOpponent(room); });
      card.append(waiting, code, botFillBtn);
      return card;
    }

    const isMe = player.id === localPlayerId();
    const ready = player.ready && player.stakeLocked;
    card.dataset.me = String(isMe);
    card.dataset.ready = String(ready);
    const emoteObj = PVP_EMOTES.find(e => e.id === player.emote?.id);
    const showEmote = !!player.emote && deps.now() - player.emote.sentAt < 10000;

    const head = node("div", "cb-pvp-player-head");
    head.append(node("strong", "", isMe ? wt("You", "Bạn") : player.name));
    const meta = node("span", "cb-pvp-player-meta");
    meta.append(icon("coins", 14), node("span", "", formatNumber(player.coins, vi)), node("span", "cb-pvp-wl", `${player.wins}W·${player.losses}L`));
    head.append(meta);

    const emoteBubble = node("div", "cb-pvp-emote-bubble");
    emoteBubble.dataset.pvpEmoteBubble = slot;
    if (showEmote && player.emote) emoteBubble.textContent = emoteObj ? (vi ? emoteObj.vi : emoteObj.en) : player.emote.text;
    else emoteBubble.hidden = true;

    const previewCanvas = node("canvas", "cb-pvp-preview-canvas");
    previewCanvas.dataset.pvpPreview = slot;
    previewCanvas.width = 240;
    previewCanvas.height = 190;
    previewCanvas.setAttribute("role", "img");
    previewCanvas.setAttribute("aria-label", `${player.name} · ${cosmeticName(player.equipment.crane, vi)} · ${cosmeticName(player.equipment.building, vi)} · ${cosmeticName(player.equipment.roof, vi)}`);
    void deps.renderer
      .loadEquipment(room.building, player.equipment)
      .then(() => { deps.renderer.drawPreview(previewCanvas, room.building, player.equipment, false); })
      .catch(() => { deps.renderer.drawPreview(previewCanvas, room.building, player.equipment, false); });

    const status = node("div", "cb-pvp-player-status");
    status.dataset.pvpReadyState = String(ready);
    status.append(icon(ready ? "check" : "clock", 16), node("span", "", ready ? wt("Ready", "Sẵn sàng") : wt("Preparing", "Đang chuẩn bị")));

    card.append(head, emoteBubble, previewCanvas, status);
    return card;
  }

  function renderRoomScreen(): void {
    if (!currentRoom) {
      renderEntryScreen();
      return;
    }
    const room = currentRoom;
    const vi = deps.vi();
    const me = room.players[currentSlot];
    const isHost = currentSlot === "p1";
    const isReady = !!me?.ready && !!me?.stakeLocked;

    const toggleReady = () => {
      if (!deps.pvp || !currentRoom) return;
      const currentMe = currentRoom.players[currentSlot];
      if (!currentMe) return;
      const nextReady = !(currentMe.ready && currentMe.stakeLocked);
      let nextSave = deps.save();
      const balanceBeforeLock = nextSave.coins;
      if (nextReady) {
        try {
          nextSave = lockPvpStake(nextSave, currentRoom.roomId, currentRoom.stakePerPlayer);
          deps.updateSave(nextSave);
        } catch {
          deps.message(wt(`Insufficient Coins! You need ${currentRoom.stakePerPlayer} Coins to lock stake.`, `Không đủ Xu! Cần ${currentRoom.stakePerPlayer} Xu để khóa cược.`));
          return;
        }
      } else {
        nextSave = refundPvpStake(nextSave, currentRoom.roomId, currentRoom.stakePerPlayer);
        deps.updateSave(nextSave);
      }
      void deps.pvp.setReady(currentRoom.roomId, currentSlot, nextReady, Math.max(balanceBeforeLock, nextSave.coins));
    };

    deps.screen(`${wt("Room", "Phòng")} #${room.roomCode} · POT ${room.totalPot}`, "cb-pvp-screen");
    deps.panel.classList.add("cb-pvp-panel");
    deps.panel.dataset.pvpScreen = "room";
    openMode = "room"; // screen() calls clear(), which resets openMode

    const wrap = node("div", "cb-pvp");
    const top = node("div", "cb-top");
    const leaveBtn = roundButton("x", wt("Leave room", "Rời phòng"), () => { leaveCurrentRoom(true); openLobby(); });
    leaveBtn.dataset.pvpLeave = "true";
    const code = node("button", "cb-pvp-code-pill");
    code.type = "button";
    code.dataset.pvpRoomCode = room.roomCode;
    code.dataset.pvpCopyCode = "true";
    code.setAttribute("aria-label", `${wt("Copy room code", "Sao chép mã phòng")} ${room.roomCode}`);
    code.title = wt("Copy room code", "Sao chép mã phòng");
    code.append(node("small", "", "#"), node("strong", "", room.roomCode), icon("check-circle-2", 18, "cb-pvp-copy-icon"));
    code.addEventListener("click", () => {
      void navigator.clipboard?.writeText(room.roomCode).catch(() => {});
      deps.message(wt(`Copied room code ${room.roomCode}!`, `Đã sao chép mã phòng ${room.roomCode}!`));
    });
    const pot = pill("coins", formatNumber(room.totalPot, vi), "Pot", "cb-coin-chip");
    pot.dataset.pvpRoomPot = String(room.totalPot);
    top.append(leaveBtn, code, pot);

    const versus = node("div", "cb-pvp-versus");
    versus.append(renderPlayerLobbyCard("p1", room), node("span", "cb-pvp-vs-badge", "VS"), renderPlayerLobbyCard("p2", room));

    const stakeNote = node("p", "cb-pvp-stake");
    stakeNote.append(icon("coins", 16), node("span", "", wt(`${formatNumber(room.stakePerPlayer, vi)} each · winner takes ${formatNumber(room.totalPot, vi)}`, `Mỗi người ${formatNumber(room.stakePerPlayer, vi)} · thắng nhận ${formatNumber(room.totalPot, vi)}`)));

    const extras: HTMLElement[] = [];
    if (isHost && !isReady) {
      const potRow = node("div", "cb-pvp-pot-row");
      for (const preset of PVP_PRESET_POTS) {
        const b = node("button", "cb-chip", formatNumber(preset, vi));
        b.type = "button";
        b.dataset.pvpRoomPotBtn = String(preset);
        b.setAttribute("aria-pressed", String(room.totalPot === preset));
        b.addEventListener("click", () => {
          if (!deps.pvp || !currentRoom) return;
          void deps.pvp.updateTotalPot(currentRoom.roomId, preset).catch(() => {
            deps.message(wt("Not enough Coins for that Total Pot.", "Không đủ Xu cho mức Tổng Cược này."));
          });
        });
        potRow.append(b);
      }
      extras.push(potRow);
    }

    const emoteBar = node("div", "cb-pvp-emote-bar");
    for (const emote of PVP_EMOTES) {
      const eb = node("button", "cb-chip cb-emote", vi ? emote.vi : emote.en);
      eb.type = "button";
      eb.dataset.pvpEmote = emote.id;
      eb.addEventListener("click", () => {
        if (!deps.pvp || !currentRoom) return;
        void deps.pvp.sendEmote(currentRoom.roomId, currentSlot, { id: emote.id, text: vi ? emote.vi : emote.en, sentAt: deps.now() });
      });
      emoteBar.append(eb);
    }

    const readyBtn = isReady
      ? node("button", "cb-pvp-unready")
      : bigButton("check", wt(`Ready · lock ${formatNumber(room.stakePerPlayer, vi)}`, `Sẵn sàng · khóa ${formatNumber(room.stakePerPlayer, vi)}`), toggleReady);
    if (isReady) {
      readyBtn.type = "button";
      readyBtn.append(icon("x", 18), node("span", "", wt(`Cancel ready · refund ${formatNumber(room.stakePerPlayer, vi)}`, `Hủy sẵn sàng · hoàn ${formatNumber(room.stakePerPlayer, vi)}`)));
      readyBtn.addEventListener("click", toggleReady);
    }
    readyBtn.dataset.pvpReady = "true";
    readyBtn.setAttribute("aria-pressed", String(isReady));

    wrap.append(top, versus, stakeNote, ...extras, emoteBar, readyBtn);
    deps.panel.append(wrap);
    readyBtn.focus({ preventScroll: true });
  }

  function renderResultScreen(room: PvpRoomState): void {
    hideLiveOverlay();
    stopBot();
    const res = room.result;
    if (!res) return;
    const vi = deps.vi();
    const isDraw = res.winnerSlot === "draw";
    const iWon = !isDraw && res.winnerSlot === currentSlot;
    const outcome = isDraw ? "draw" : iWon ? "win" : "lose";
    const myPayout = res.payouts[currentSlot];
    const title = isDraw ? wt("Draw", "Hòa") : iWon ? wt("Victory!", "Chiến thắng!") : wt("Defeat", "Thua cuộc");

    deps.screen(title, "cb-pvp-screen");
    deps.panel.classList.add("cb-pvp-panel");
    deps.panel.dataset.pvpScreen = "result";
    openMode = "result"; // screen() calls clear(), which resets openMode

    const wrap = node("div", "cb-result");
    const card = node("section", "cb-result-card cb-pvp-result");
    card.dataset.outcome = outcome;
    card.dataset.pvpResultWinner = res.winnerSlot;
    const banner = node("div", "cb-pvp-result-banner");
    banner.append(icon(isDraw ? "swords" : iWon ? "crown" : "x", 34), node("strong", "", title));
    const coins = node("span", "cb-result-coins cb-pvp-payout");
    coins.append(icon("coins", 20), node("strong", "", isDraw ? `±0` : iWon ? `+${formatNumber(myPayout, vi)}` : `-${formatNumber(res.stakePerPlayer, vi)}`));
    const cols = node("div", "cb-pvp-result-cols");
    for (const slot of ["p1", "p2"] as const) {
      const summary = slot === "p1" ? res.p1Summary : res.p2Summary;
      const name = slot === "p1" ? room.players.p1.name : room.players.p2?.name ?? "P2";
      const col = node("div", "cb-pvp-result-col");
      col.dataset.pvpResultSlot = slot;
      col.dataset.winner = String(res.winnerSlot === slot);
      const who = node("small", "cb-pvp-result-name");
      if (res.winnerSlot === slot) who.append(icon("crown", 14));
      who.append(node("span", "", slot === currentSlot ? wt("You", "Bạn") : name));
      const floors = node("strong", "cb-pvp-result-floors", String(summary.height));
      const sub = node("span", "cb-pvp-result-sub");
      sub.append(icon("layers", 14), node("span", "", wt("Floors", "Tầng")), icon("star", 14), node("span", "", String(summary.perfectCount)));
      col.append(who, floors, sub);
      cols.append(col);
    }
    card.append(banner, coins, cols);

    const again = bigButton("swords", wt("Play again", "Đấu tiếp"), () => { leaveCurrentRoom(false); openLobby(); });
    again.dataset.pvpPlayAgain = "true";
    const row = node("div", "cb-result-row");
    row.append(roundButton("home", wt("Home", "Trang chủ"), () => { leaveCurrentRoom(false); clear(); deps.home(); }, "cb-round-lg"));
    const actions = node("div", "cb-result-actions");
    actions.append(again, row);
    wrap.append(card, actions);
    deps.panel.append(wrap);
    again.focus({ preventScroll: true });
  }
  function openLobby(initialRoomCode?: string): void {
    if (!deps.pvp) {
      deps.message(wt("Solo PvP is unavailable in this environment.", "Solo PvP không khả dụng trong môi trường này."));
      deps.home();
      return;
    }
    if (initialRoomCode) {
      joinCodeInput = initialRoomCode.toUpperCase();
      renderEntryScreen();
      void joinRoomByCode(joinCodeInput);
      return;
    }
    if (currentRoom && currentRoom.status === "waiting") {
      if (!unsubscribeRoom) subscribeToRoom(currentRoom.roomId);
      renderRoomScreen();
      return;
    }
    refreshWaitingRooms();
    renderEntryScreen();
  }

  return {
    openLobby,
    isOpen(): boolean {
      return openMode !== "none";
    },
    isInActiveMatch(): boolean {
      return !!activeMatchRoomId && !!currentRoom && currentRoom.status !== "completed";
    },
    clear,
    refresh(): void {
      if (openMode === "entry") renderEntryScreen();
      else if (openMode === "room") renderRoomScreen();
      else if (openMode === "result" && currentRoom) renderResultScreen(currentRoom);
    },
    onLocalFrame(game: QuickTowerGame): void {
      if (!deps.pvp || !currentRoom || !activeMatchRoomId) return;
      const snap = game.getSnapshot();
      const recInputs = game.getInputs();
      const telemetry = extractLiveTelemetryFromSnapshot(snap, deps.now());

      // Broadcast any newly committed drop events immediately
      if (recInputs.length > lastDropCountSent) {
        for (let i = lastDropCountSent; i < recInputs.length; i++) {
          void deps.pvp.pushDrop(currentRoom.roomId, currentSlot, recInputs[i], telemetry);
        }
        lastDropCountSent = recInputs.length;
      }

      // Broadcast live telemetry every 8 ticks (~7.5 Hz)
      if (snap.tick - lastBroadcastTick >= 8 || snap.phase === "ended") {
        lastBroadcastTick = snap.tick;
        void deps.pvp.pushTelemetry(currentRoom.roomId, currentSlot, telemetry);
      }

      updateLiveOverlayUi();
    },
    onLocalEnded(game: QuickTowerGame): void {
      if (!deps.pvp || !currentRoom || !activeMatchRoomId) return;
      const snap = game.getSnapshot();
      const res = game.getResult();
      const telemetry = extractLiveTelemetryFromSnapshot(snap, deps.now());
      if (!localFinishSubmitted) {
        localFinishSubmitted = true;
        void deps.pvp.finishOrResolve(currentRoom.roomId, currentSlot, telemetry).then(resolved => {
          if (resolved && currentRoom) {
            currentRoom = { ...currentRoom, status: "completed", result: resolved };
            settleCompletedMatch(currentRoom);
            renderResultScreen(currentRoom);
          }
        });
      }

      // If opponent hasn't finished all 3 lives yet, enter Full-Screen Spectator Mode!
      if (currentRoom.status !== "completed") {
        liveOverlay.hidden = false;
        liveOverlay.dataset.pvpSpectator = "true";
        const note = liveOverlay.querySelector<HTMLElement>("[data-pvp-spectator-note]");
        if (note) {
          note.hidden = false;
          note.textContent = wt(
            `You finished all 3 lives at ${res.height}F — Watching opponent live until they finish all 3 lives...`,
            `Bạn đã hết 3 mạng (${res.height} tầng) — Đang xem trực tiếp đối thủ xây cho tới khi hết 3 mạng...`,
          );
        }
        updateLiveOverlayUi();
      } else {
        settleCompletedMatch(currentRoom);
        renderResultScreen(currentRoom);
      }
    },
    dispose(): void {
      stopBot();
      disconnectRoomSubscription();
      if (unsubscribeStats) {
        unsubscribeStats();
        unsubscribeStats = null;
      }
      oppRenderer.dispose();
      liveOverlay.remove();
    },
  };
}
