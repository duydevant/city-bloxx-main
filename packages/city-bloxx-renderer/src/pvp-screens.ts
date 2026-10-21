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

  function localPlayerId(): string {
    return `pvp-${deps.installationId().slice(0, 12)}`;
  }

  function localPlayerName(): string {
    const id = deps.installationId().slice(0, 4).toUpperCase();
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
    deps.panel.classList.remove("cb-pvp-panel");
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
                const recInputs = botGame.getRecord().inputs;
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

  function renderEntryScreen(): void {
    openMode = "entry";
    const save = deps.save();
    const potCheck = canAffordPot(selectedPot, save.coins);
    deps.showPanel(
      wt("Solo PvP 1v1 · Coin Wager", "Đấu Solo PvP 1v1 · Cược Xu"),
      wt(
        "Both players wager equal Coins into the Total Pot. Build simultaneously with 3 lives — once BOTH players lose all 3 lives, higher tower takes 100% of the Pot!",
        "2 người chơi góp bằng nhau vào Tổng Quỹ Cược. Cùng xây với 3 mạng — khi CẢ 2 đều hết 3 mạng, ai xây số tầng cao hơn ăn trọn 100% quỹ cược!",
      ),
      [
        deps.button(wt("Customize Skins", "Đổi Skin Cẩu/Nhà"), () => {
          clear();
          deps.openBook();
        }),
        deps.button(wt("Home", "Trang chủ"), () => {
          clear();
          deps.home();
        }),
      ],
    );
    deps.panel.classList.add("cb-pvp-panel");
    deps.panel.dataset.pvpScreen = "entry";

    const container = document.createElement("div");
    container.className = "cb-pvp-content";

    // Wallet & Online Status Bar
    const statusRow = document.createElement("div");
    statusRow.className = "cb-pvp-wallet-bar";
    statusRow.innerHTML = `
      <span data-pvp-wallet>${lucideSvg("coins", 14)} <strong>${save.coins}</strong> Coins</span>
      <span>${lucideSvg("users", 14)} <strong data-pvp-online-count>${onlinePlayersCount}</strong> Online</span>
      <a href="/pvp" class="cb-pvp-stats-link" data-pvp-dashboard-link>${lucideSvg("bar-chart-3", 14)} <span>${wt("Live Firebase Stats", "Thống kê Realtime")}</span></a>
    `;

    // Total Pot Selector Card
    const createCard = document.createElement("section");
    createCard.className = "cb-pvp-card";
    const stakeEach = Math.floor(selectedPot / 2);

    const potTitle = document.createElement("strong");
    potTitle.textContent = wt(
      `1. Configure Total Pot: ${selectedPot} Coins (${stakeEach} Coins / player)`,
      `1. Chọn Tổng Tiền Cược (Total Pot): ${selectedPot} Xu (Mỗi người góp ${stakeEach} Xu)`,
    );
    createCard.append(potTitle);

    const potRow = document.createElement("div");
    potRow.className = "cb-pvp-pot-row";
    for (const preset of PVP_PRESET_POTS) {
      const b = deps.button(`${preset} Coins`, () => {
        selectedPot = preset;
        customPotInput = String(preset);
        renderEntryScreen();
      });
      b.dataset.pvpPot = String(preset);
      b.setAttribute("aria-pressed", String(selectedPot === preset));
      potRow.append(b);
    }

    const customInput = document.createElement("input");
    customInput.type = "number";
    customInput.min = "20";
    customInput.step = "20";
    customInput.placeholder = wt("Custom Pot (even)", "Nhập tổng cược chẵn");
    customInput.className = "cb-pvp-input";
    customInput.dataset.pvpCustomPot = "true";
    customInput.value = customPotInput;
    customInput.addEventListener("change", () => {
      customPotInput = customInput.value;
      const parsed = Number(customInput.value);
      if (Number.isFinite(parsed) && parsed >= 20) {
        selectedPot = Math.floor(parsed / 2) * 2;
        renderEntryScreen();
      }
    });
    potRow.append(customInput);
    createCard.append(potRow);

    const actionRow = document.createElement("div");
    actionRow.className = "cb-pvp-action-row";

    const createBtn = deps.button(
      wt(`Create Room (Pot ${selectedPot})`, `Tạo Phòng (Tổng cược ${selectedPot})`),
      () => {
        if (!deps.pvp) return;
        const check = canAffordPot(selectedPot, deps.save().coins);
        if (!check.valid) {
          deps.message(
            wt(
              `Need at least ${check.stakePerPlayer} Coins to create a ${selectedPot} Pot room.`,
              `Cần tối thiểu ${check.stakePerPlayer} Xu để tạo phòng tổng cược ${selectedPot}.`,
            ),
          );
          return;
        }
        void deps.pvp
          .createRoom({
            totalPot: selectedPot,
            seed: (deps.now() & 0x7fffffff) || 12345,
            host: {
              id: localPlayerId(),
              name: localPlayerName(),
              coins: deps.save().coins,
              equipment: localEquipment(),
            },
          })
          .then(({ room, slot }) => {
            currentRoom = room;
            currentSlot = slot;
            subscribeToRoom(room.roomId);
            renderRoomScreen();
          });
      },
    );
    createBtn.dataset.pvpCreate = "true";
    createBtn.disabled = !potCheck.valid;

    const botBtn = deps.button(
      wt(`Solo 1v1 vs Live Bot (Pot ${selectedPot})`, `Đấu Ngay vs Bot Cược Xu (${selectedPot})`),
      () => {
        if (!deps.pvp) return;
        const check = canAffordPot(selectedPot, deps.save().coins);
        if (!check.valid) {
          deps.message(wt("Insufficient Coins for this stake.", "Không đủ Xu cho mức cược này."));
          return;
        }
        void deps.pvp
          .createRoom({
            totalPot: selectedPot,
            seed: (deps.now() & 0x7fffffff) || 54321,
            host: {
              id: localPlayerId(),
              name: localPlayerName(),
              coins: deps.save().coins,
              equipment: localEquipment(),
            },
          })
          .then(({ room, slot }) => {
            currentRoom = room;
            currentSlot = slot;
            subscribeToRoom(room.roomId);
            renderRoomScreen();
            startBotOpponent(room);
          });
      },
    );
    botBtn.dataset.pvpBot = "true";
    botBtn.disabled = !potCheck.valid;

    actionRow.append(createBtn, botBtn);
    createCard.append(actionRow);

    // Join by Room Code Card
    const joinCard = document.createElement("section");
    joinCard.className = "cb-pvp-card";
    const joinTitle = document.createElement("strong");
    joinTitle.textContent = wt("2. Join Room by Code or Waiting List", "2. Vào Phòng bằng Mã Code hoặc Danh sách chờ");
    joinCard.append(joinTitle);

    const joinRow = document.createElement("div");
    joinRow.className = "cb-pvp-join-row";
    const codeInput = document.createElement("input");
    codeInput.type = "text";
    codeInput.maxLength = 12;
    codeInput.placeholder = wt("6-char Room Code (e.g. AB12CD)", "Mã phòng 6 ký tự");
    codeInput.className = "cb-pvp-input";
    codeInput.dataset.pvpJoinInput = "true";
    codeInput.value = joinCodeInput;
    codeInput.addEventListener("input", () => {
      joinCodeInput = codeInput.value.toUpperCase().trim();
      codeInput.value = joinCodeInput;
    });

    const joinBtn = deps.button(wt("Join Room", "Vào Phòng"), () => {
      if (!deps.pvp || !joinCodeInput) return;
      void joinRoomByCode(joinCodeInput);
    });
    joinBtn.dataset.pvpJoinBtn = "true";
    joinRow.append(codeInput, joinBtn);
    joinCard.append(joinRow);

    // Waiting Rooms List
    const roomList = document.createElement("div");
    roomList.className = "cb-pvp-room-list";
    roomList.dataset.pvpRoomList = "true";
    if (waitingRooms.length === 0) {
      const emptyNote = document.createElement("small");
      emptyNote.textContent = wt(
        "No open waiting rooms right now — create one above or share a room code across 2 tabs!",
        "Chưa có phòng đang chờ — hãy tạo phòng ở trên hoặc mở 2 tab để nhập mã phòng!",
      );
      roomList.append(emptyNote);
    } else {
      for (const item of waitingRooms.slice(0, 4)) {
        const row = document.createElement("div");
        row.className = "cb-pvp-room-item";
        const info = document.createElement("span");
        info.textContent = `#${item.roomCode} · ${item.players.p1.name} · Pot ${item.totalPot} (${item.stakePerPlayer}/người)`;
        const jBtn = deps.button(wt("Join", "Vào"), () => {
          void joinRoomByCode(item.roomCode);
        });
        jBtn.dataset.pvpJoinRoom = item.roomCode;
        row.append(info, jBtn);
        roomList.append(row);
      }
    }
    joinCard.append(roomList);

    container.append(statusRow, createCard, joinCard);
    deps.panel.querySelector("p")!.replaceWith(container);
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
      subscribeToRoom(room.roomId);
      renderRoomScreen();
    } catch {
      deps.message(wt(`Could not join room ${normalized} (not found or full).`, `Không thể vào phòng ${normalized} (không tồn tại hoặc đã đầy).`));
    }
  }

  function renderPlayerLobbyCard(slot: PvpSlot, room: PvpRoomState): HTMLElement {
    const player = room.players[slot];
    const card = document.createElement("article");
    card.className = "cb-pvp-player-card";
    card.dataset.pvpPlayerCard = slot;

    if (!player) {
      card.innerHTML = `
        <div class="cb-pvp-player-head">
          <strong>${slot.toUpperCase()} · ${wt("Waiting for opponent...", "Đang chờ đối thủ vào phòng...")}</strong>
        </div>
        <div class="cb-pvp-empty-slot">
          <span>${lucideSvg("timer", 14)} ${wt("Share Room Code", "Chia sẻ mã phòng")}: <strong>${room.roomCode}</strong></span>
        </div>
      `;
      const botFillBtn = deps.button(wt("Fill with Live Bot", "Cho Bot vào đấu ngay"), () => {
        startBotOpponent(room);
      });
      botFillBtn.dataset.pvpSpawnBot = "true";
      card.append(botFillBtn);
      return card;
    }

    const isMe = player.id === localPlayerId();
    const emoteObj = PVP_EMOTES.find(e => e.id === player.emote?.id);
    const showEmote = !!player.emote && deps.now() - player.emote.sentAt < 10000;

    const head = document.createElement("div");
    head.className = "cb-pvp-player-head";
    head.innerHTML = `
      <strong>${lucideSvg("users", 14)} ${player.name} ${isMe ? `(${wt("You", "Bạn")})` : ""}</strong>
      <span class="cb-pvp-player-meta">${lucideSvg("coins", 13)} ${player.coins} · ${player.wins}W-${player.losses}L</span>
    `;

    const statusBadge = document.createElement("div");
    statusBadge.className = "cb-pvp-player-status";
    statusBadge.dataset.pvpReadyState = String(player.ready && player.stakeLocked);
    statusBadge.innerHTML =
      player.ready && player.stakeLocked
        ? `${lucideSvg("check-circle-2", 14)} <span>${wt(`Ready & Locked ${room.stakePerPlayer} Coins`, `Đã Khóa Cược ${room.stakePerPlayer} Xu`)}</span>`
        : `${lucideSvg("clock", 14)} <span>${wt("Inspecting / Preparing...", "Đang chuẩn bị...")}</span>`;

    const emoteBubble = document.createElement("div");
    emoteBubble.className = "cb-pvp-emote-bubble";
    emoteBubble.dataset.pvpEmoteBubble = slot;
    if (showEmote && player.emote) {
      emoteBubble.textContent = emoteObj
        ? (deps.vi() ? emoteObj.vi : emoteObj.en)
        : player.emote.text;
    } else {
      emoteBubble.hidden = true;
    }

    const previewCanvas = document.createElement("canvas");
    previewCanvas.className = "cb-pvp-preview-canvas";
    previewCanvas.dataset.pvpPreview = slot;
    previewCanvas.width = 240;
    previewCanvas.height = 190;
    previewCanvas.setAttribute(
      "aria-label",
      `${player.name} ${wt("equipped crane and building preview", "xem trước trang bị cần cẩu và tòa nhà")}`,
    );

    void deps.renderer
      .loadEquipment(room.building, player.equipment)
      .then(() => {
        deps.renderer.drawPreview(previewCanvas, room.building, player.equipment, false);
      })
      .catch(() => {
        deps.renderer.drawPreview(previewCanvas, room.building, player.equipment, false);
      });

    const equipSummary = document.createElement("small");
    equipSummary.className = "cb-pvp-equip-summary";
    equipSummary.dataset.pvpEquipSummary = slot;
    equipSummary.textContent = `${cosmeticName(player.equipment.crane, deps.vi())} · ${cosmeticName(player.equipment.building, deps.vi())} · ${cosmeticName(player.equipment.roof, deps.vi())}`;

    card.append(head, statusBadge, emoteBubble, previewCanvas, equipSummary);
    return card;
  }

  function renderRoomScreen(): void {
    if (!currentRoom) {
      renderEntryScreen();
      return;
    }
    openMode = "room";
    const room = currentRoom;
    const me = room.players[currentSlot];
    const isHost = currentSlot === "p1";
    const isReady = !!me?.ready && !!me?.stakeLocked;

    const readyBtn = deps.button(
      isReady
        ? wt(`Cancel Ready (Refund ${room.stakePerPlayer} Coins)`, `Hủy Sẵn Sàng (Hoàn ${room.stakePerPlayer} Xu)`)
        : wt(`Ready & Lock Stake (${room.stakePerPlayer} Coins)`, `Sẵn Sàng & Khóa Cược (${room.stakePerPlayer} Xu)`),
      () => {
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
            deps.message(
              wt(
                `Insufficient Coins! You need ${currentRoom.stakePerPlayer} Coins to lock stake.`,
                `Không đủ Xu! Cần ${currentRoom.stakePerPlayer} Xu để khóa cược.`,
              ),
            );
            return;
          }
        } else {
          nextSave = refundPvpStake(nextSave, currentRoom.roomId, currentRoom.stakePerPlayer);
          deps.updateSave(nextSave);
        }
        void deps.pvp.setReady(currentRoom.roomId, currentSlot, nextReady, Math.max(balanceBeforeLock, nextSave.coins));
      },
    );
    readyBtn.dataset.pvpReady = "true";
    readyBtn.setAttribute("aria-pressed", String(isReady));

    const leaveBtn = deps.button(wt("Leave Room", "Rời Phòng"), () => {
      leaveCurrentRoom(true);
      openLobby();
    });
    leaveBtn.dataset.pvpLeave = "true";

    deps.showPanel(
      `${wt("Room", "Phòng")} #${room.roomCode} · POT ${room.totalPot}`,
      wt(
        `Each player stakes ${room.stakePerPlayer} Coins · Winner takes all ${room.totalPot} Coins after both finish 3 lives`,
        `Mỗi người cược ${room.stakePerPlayer} Xu · Người cao tầng hơn sau khi cả 2 hết 3 mạng nhận trọn ${room.totalPot} Xu`,
      ),
      [readyBtn, leaveBtn],
    );
    deps.panel.classList.add("cb-pvp-panel");
    deps.panel.dataset.pvpScreen = "room";

    const container = document.createElement("div");
    container.className = "cb-pvp-room-container";

    // Top Room Bar: Code + Copy + Pot Config (if host & not locked)
    const topBar = document.createElement("div");
    topBar.className = "cb-pvp-room-topbar";

    const codeBadge = document.createElement("span");
    codeBadge.dataset.pvpRoomCode = room.roomCode;
    codeBadge.innerHTML = `${wt("Code", "Mã phòng")}: <strong>${room.roomCode}</strong>`;

    const copyBtn = deps.button(wt("Copy Code", "Sao chép mã"), () => {
      void navigator.clipboard?.writeText(room.roomCode).catch(() => {});
      deps.message(wt(`Copied room code ${room.roomCode}!`, `Đã sao chép mã phòng ${room.roomCode}!`));
    });
    copyBtn.dataset.pvpCopyCode = "true";

    const potBadge = document.createElement("span");
    potBadge.dataset.pvpRoomPot = String(room.totalPot);
    potBadge.innerHTML = `${lucideSvg("coins", 14)} Total Pot: <strong>${room.totalPot}</strong> (${room.stakePerPlayer}/${wt("player", "người")})`;

    topBar.append(codeBadge, copyBtn, potBadge);

    if (isHost && !isReady) {
      const potConfigRow = document.createElement("div");
      potConfigRow.className = "cb-pvp-pot-inline";
      for (const preset of PVP_PRESET_POTS) {
        const b = deps.button(`${preset} Coins`, () => {
          if (!deps.pvp || !currentRoom) return;
          void deps.pvp.updateTotalPot(currentRoom.roomId, preset).catch(() => {
            deps.message(wt("Not enough Coins for that Total Pot.", "Không đủ Xu cho mức Tổng Cược này."));
          });
        });
        b.dataset.pvpRoomPotBtn = String(preset);
        b.setAttribute("aria-pressed", String(room.totalPot === preset));
        potConfigRow.append(b);
      }
      topBar.append(potConfigRow);
    }

    // Dual Player Live Cards (P1 vs P2)
    const grid = document.createElement("div");
    grid.className = "cb-pvp-vs-grid";
    grid.append(renderPlayerLobbyCard("p1", room), renderPlayerLobbyCard("p2", room));

    // Emote Bar
    const emoteBar = document.createElement("div");
    emoteBar.className = "cb-pvp-emote-bar";
    for (const emote of PVP_EMOTES) {
      const eb = deps.button(deps.vi() ? emote.vi : emote.en, () => {
        if (!deps.pvp || !currentRoom) return;
        void deps.pvp.sendEmote(currentRoom.roomId, currentSlot, {
          id: emote.id,
          text: deps.vi() ? emote.vi : emote.en,
          sentAt: deps.now(),
        });
      });
      eb.dataset.pvpEmote = emote.id;
      emoteBar.append(eb);
    }

    container.append(topBar, grid, emoteBar);
    deps.panel.querySelector("p")!.replaceWith(container);
  }

  function renderResultScreen(room: PvpRoomState): void {
    openMode = "result";
    hideLiveOverlay();
    stopBot();
    const res = room.result;
    if (!res) return;

    const isDraw = res.winnerSlot === "draw";
    const iWon = !isDraw && res.winnerSlot === currentSlot;
    const p1Name = room.players.p1.name;
    const p2Name = room.players.p2?.name ?? "P2";

    const title = isDraw
      ? wt(`Draw Match · Refunded ${res.stakePerPlayer} Coins`, `Hòa Số Tầng · Hoàn trả ${res.stakePerPlayer} Xu`)
      : iWon
        ? wt(`VICTORY! You Won +${res.totalPot} Coins!`, `CHIẾN THẮNG! Bạn nhận trọn +${res.totalPot} Xu!`)
        : wt(`Defeat · Opponent Won ${res.totalPot} Coins`, `Thua Cuộc · Đối thủ nhận ${res.totalPot} Xu`);

    const subtitle = wt(
      `Both players exhausted all 3 lives · Final Towers: ${p1Name} (${res.p1Summary.height}F) vs ${p2Name} (${res.p2Summary.height}F)`,
      `Cả 2 người chơi đã dùng hết 3 mạng · Số tầng cuối: ${p1Name} (${res.p1Summary.height} tầng) vs ${p2Name} (${res.p2Summary.height} tầng)`,
    );

    const playAgainBtn = deps.button(wt("Back to PvP Lobby", "Về Sảnh Solo PvP"), () => {
      leaveCurrentRoom(false);
      openLobby();
    });
    playAgainBtn.dataset.pvpPlayAgain = "true";

    deps.showPanel(title, subtitle, [
      playAgainBtn,
      deps.button(wt("Home", "Trang chủ"), () => {
        leaveCurrentRoom(false);
        clear();
        deps.home();
      }),
    ]);
    deps.panel.classList.add("cb-pvp-panel");
    deps.panel.dataset.pvpScreen = "result";

    const card = document.createElement("div");
    card.className = "cb-pvp-result-summary";
    card.dataset.pvpResultWinner = res.winnerSlot;
    card.innerHTML = `
      <div class="cb-pvp-result-col" data-pvp-result-slot="p1">
        <strong>${p1Name} ${res.winnerSlot === "p1" ? lucideSvg("crown", 14) : ""}</strong>
        <span>${wt("Floors", "Số tầng")}: <strong>${res.p1Summary.height}F</strong></span>
        <span>${wt("Population", "Dân số")}: ${res.p1Summary.population}</span>
        <span>Perfect: ${res.p1Summary.perfectCount}</span>
        <span class="cb-pvp-payout">${res.winnerSlot === "p1" ? `+${res.payouts.p1} Coins` : isDraw ? `+${res.payouts.p1} Coins` : `0 Coins (${res.netDelta.p1})`}</span>
      </div>
      <div class="cb-pvp-result-col" data-pvp-result-slot="p2">
        <strong>${p2Name} ${res.winnerSlot === "p2" ? lucideSvg("crown", 14) : ""}</strong>
        <span>${wt("Floors", "Số tầng")}: <strong>${res.p2Summary.height}F</strong></span>
        <span>${wt("Population", "Dân số")}: ${res.p2Summary.population}</span>
        <span>Perfect: ${res.p2Summary.perfectCount}</span>
        <span class="cb-pvp-payout">${res.winnerSlot === "p2" ? `+${res.payouts.p2} Coins` : isDraw ? `+${res.payouts.p2} Coins` : `0 Coins (${res.netDelta.p2})`}</span>
      </div>
    `;
    deps.panel.querySelector(".cb-actions")!.before(card);
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
      const recInputs = game.getRecord().inputs;
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
