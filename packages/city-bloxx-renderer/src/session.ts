import { SESSION_TEXT, type SessionTextKey } from "../../city-bloxx-content/session-locales";
import { acknowledgeEvolutionStage, allocateRun, beginDistrictTower, BUNDLED_LIVEOPS_MANIFEST, BUILDING_IDS, BUILDINGS, cancelCityTower, CITY_EVOLUTION_STAGES, claimSeasonTier, claimWeeklyContract, claimWinterEventGoal, demolishDistrictBuilding, deriveEvolutionStage, districtGoalProgress, districtPlacementStatus, DOCK_CLOCK_TOWER_LANDMARK, emptySave, ensureWeeklyContracts, extractOneDropResult, initializeTracking, isSettled, makeSummary, pinReplay, prepareSave, QuickTowerGame, QuickTowerReplay, REPLAY_SPEEDS, resolveOneDrop, resolvePerfectRush, resolvePersonalGhost, resolveSkylineSprint, restoreTower, selectDistrict, settleRun, toggleHallOfFame, totalCityPopulation, updateCityCheckpoint, type AudioPort, type BuildingId, type Capabilities, type DistrictId, type GameSave, type LifecyclePort, type LiveOpsManifest, type ReplaySpeed, type RunConfig, type RunContext, type RunRecord, type SavePort, type ScorePort, type ScoreSyncState, type TrackingPort } from "../../city-bloxx-core/src/index";
import { QuickTowerRenderer } from "./index";
import { cityGuide } from "./city-guide";
import { createDataScreens } from "./data-screens";
import { createSaveController } from "./save-controller";
import { beginDaily, checkpointDaily, currentDailyStreak, resolveDaily, utcDate } from "../../city-bloxx-core/src/index";
import { createDailyScreens } from "./daily-screens";
import { acceptTrackedCity, claimMission, ensureMissions, recordRunProgress, rerollSaveMission } from "../../city-bloxx-core/src/index";
import { createProgressionScreens, type RewardSaveStatus } from "./progression-screens";
import { buyCosmeticWithCoins, DEFAULT_EQUIPMENT, equipmentFor, equipCosmetic, grantCosmetics, renderCosmetic, type RunEquipment } from "../../city-bloxx-core/src/cosmetics";
import { createBookScreens } from "./book-screens";
import { createDistrictScreens, preloadDistrictBackground } from "./district-screens";
import { createPvpScreens } from "./pvp-screens";
import { lucideSvg, type LucideIconName } from "./lucide-icons";
import { bigButton, formatNumber, icon, node, pill, resultCard, roundButton, tile, type ResultStat } from "./ui-kit";
import { completeTutorial, type TutorialState } from "../../city-bloxx-core/src/save-state";
import type { PvpPort, RankedPort } from "../../city-bloxx-core/src/ports";

export type SessionScreen = "quick" | "city" | "daily" | "one-drop" | "perfect-rush" | "skyline-sprint" | "pvp" | "statistics" | "history" | "book" | "progression";
export function sessionScreen(value: string | null): SessionScreen {
  return ["quick","city","daily","one-drop","perfect-rush","skyline-sprint","pvp","statistics","history","book","progression"].includes(value??"") ? value as SessionScreen : "quick";
}

export interface SessionFeatureFlags {
  daily?: boolean;
  meta?: boolean;
  cosmetics?: boolean;
}
export interface SessionOptions {
  assets: string; save: SavePort; score?: ScorePort; lifecycle?: LifecyclePort;
  audio: AudioPort; seed: () => number; locale?: string; onLocaleChange?: (locale:string) => void;
  showLanguageSwitch?: boolean; showSoundControl?: boolean;
  capabilities?: Capabilities; tracking?: TrackingPort;
  initialScreen?: SessionScreen; initialReplayId?: string; initialPvpRoom?: string; presentation?: "game" | "content";
  onNavigate?: (screen: SessionScreen, replayId?: string) => void;
  ranked?: RankedPort;
  pvp?: PvpPort;
  featureFlags?: SessionFeatureFlags;
  liveOpsManifest?: LiveOpsManifest;
}
export interface TowerSession { ready: Promise<void>; setLocale(locale:string): void; setFeatureFlags(flags:SessionFeatureFlags): void; setLiveOpsManifest?(manifest:LiveOpsManifest): void; navigate(screen:SessionScreen,replayId?:string):void; checkpointAndPause():Promise<boolean>; whenSaved():Promise<void>; dispose(): void }
export function mountQuickTower(root: HTMLElement, options: SessionOptions): TowerSession {
  let featureFlags: SessionFeatureFlags = { daily: true, meta: true, cosmetics: true, ...options.featureFlags };
  let liveOpsManifest: LiveOpsManifest = options.liveOpsManifest ?? BUNDLED_LIVEOPS_MANIFEST;
  let vi = !!options.locale?.startsWith("vi");
  const translations = new Map<string,string>(Object.entries(SESSION_TEXT));
  const t = (en: SessionTextKey) => vi ? SESSION_TEXT[en] : en;
  const quickName = () => t("Quick Tower");
  const cityName = () => t("Build City");
  const abort = new AbortController();
  const cleanups: (() => void)[] = [];
  let disposed = false;
  let ready = false;
  let storageWritable = true;
  let save = emptySave();
  const saveController = createSaveController(options.save);
  let recovering = false;
  let saveTimer = 0;
  let rewardSaveStatus: RewardSaveStatus = "idle", saveGeneration = 0;
  let runContext: RunContext | null = null;
  const now = () => options.tracking?.now() ?? Date.now();
  const installationId = () => options.tracking?.installationId() ?? [...crypto.getRandomValues(new Uint8Array(16))].map(n => n.toString(16).padStart(2,"0")).join("");
  let run: QuickTowerGame | null = null;
  let replay: QuickTowerReplay | null = null;
  let finishedRecord: RunRecord | null = null;
  let rankedId: string | null = null;
  let rankedStarting = false;
  let startGeneration = 0;
  let cityActive = false;
  let mapView = false;
  let selectedLot = 12;
  let selectedClass: BuildingId = "residential";
  let loadingCity = false;
  let loadingDaily = false;
  let lastFeedback = 0;
  let userPaused = false;
  let hostPaused = options.lifecycle?.isPaused() ?? document.hidden;
  let raf = 0;
  let lastTime = 0;
  let celebrating = false;
  let guidePage = -1;
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;
  let muted = false;
  let ghostEnabled = true;
  let replayScrubPaused = false;
  let oneDropMenuOpen = false;
  let perfectRushMenuOpen = false;
  let skylineSprintMenuOpen = false;
  let gameMenuOpen = false;

  root.classList.add("cb-game");
  root.classList.toggle("cb-content-session",options.presentation === "content");
  root.lang=vi?"vi":"en";
  // Minimal HUD: score + floors on the left, lives + pause on the right. Everything else lives in menus.
  root.innerHTML = `
    <div class="cb-arena" tabindex="0" role="application" aria-label="${quickName()}">
      <canvas aria-label="${t("Tower")}"></canvas>
      <div class="cb-hud">
        <div class="cb-hud-left">
          <div class="cb-hud-item cb-hud-score" title="${t("Population")}">
            <span class="cb-hud-label">${lucideSvg("users", 22)}<span>${t("Population")}</span></span>
            <strong data-population>0</strong>
          </div>
          <div class="cb-hud-item cb-hud-floors" title="${t("Floors")}">
            <span class="cb-hud-label">${lucideSvg("layers", 16)}<span>${t("Floors")}</span></span>
            <strong data-floors>0</strong>
          </div>
          <span data-mode class="cb-hud-mode"></span>
        </div>
        <div class="cb-hud-right">
          <strong class="cb-hud-lives" data-lives role="img" aria-label="${t("Lives")}: 3/3">${[0,1,2].map(index=>`<svg data-life="${index}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21C9 18.7 2 13.5 2 7.9C2 2.8 8.3 1.2 12 5.7C15.7 1.2 22 2.8 22 7.9C22 13.5 15 18.7 12 21Z"/><path class="cb-heart-shine" d="M5.1 7.9C5.1 5.9 7 5.4 8.3 6.4"/></svg>`).join("")}</strong>
          <button type="button" data-pause class="cb-round-btn cb-pause-btn" aria-label="${t("Pause")}" title="${t("Pause")}">${lucideSvg("pause", 22)}</button>
        </div>
        <span class="cb-sr-only"><span data-best>0</span><span data-coins>200</span></span>
      </div>
      <div class="cb-combo" aria-label="${t("Combo")}" hidden><span></span></div>
      <div class="cb-replay-controls" data-replay-controls hidden></div>
      <div class="cb-panel" role="dialog" aria-label="${t("Game menu")}"></div>
      <div class="cb-tutorial" hidden>${lucideSvg("sparkles", 18)}<span></span><button type="button" data-tutorial-dismiss>${lucideSvg("x", 16)}</button></div>
    </div>
    <p class="cb-hint cb-sr-only" aria-live="polite"></p><p class="cb-notice" role="status" aria-live="polite"></p>`;
  const el = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const arena = el(".cb-arena");
  const panel = el(".cb-panel");
  const replayControls = el("[data-replay-controls]");
  const hint = el(".cb-hint");
  const notice = el(".cb-notice");
  const tutorial=el(".cb-tutorial");let tutorialMode:keyof TutorialState="quick";
  const wt=(en:string,translation:string)=>{translations.set(en,translation);return vi?translation:en;};
  function tutorialHint(mode:keyof TutorialState, text:string):void {
    tutorialMode=mode;tutorial.hidden=save.tutorials[mode];
    tutorial.querySelector("span")!.textContent=text;
    const dismiss=el("[data-tutorial-dismiss]");dismiss.setAttribute("aria-label",wt("Dismiss tips","Ẩn mẹo"));dismiss.title=dismiss.getAttribute("aria-label")!;
  }
  const hud = new Map<string, HTMLElement>();
  function setText(selector: string, value: string): void {
    const node = hud.get(selector) ?? el(selector); hud.set(selector, node);
    if (node.textContent !== value) node.textContent = value;
  }
  const combo = el(".cb-combo span");
  const pauseButton = el<HTMLButtonElement>("[data-pause]");
  function updatePauseButtonUi(): void {
    const label = userPaused ? t("Resume") : t("Pause");
    pauseButton.innerHTML = lucideSvg(userPaused ? "play" : "pause", 22);
    pauseButton.setAttribute("aria-label", label); pauseButton.title = label;
  }
  function soundLabel(): string { return muted ? t("Sound off") : t("Sound on"); }
  function updateSoundButtonUi(): void {
    for (const soundBtn of root.querySelectorAll<HTMLButtonElement>(".cb-round-btn[data-sound]")) {
      soundBtn.innerHTML = lucideSvg(muted ? "volume-x" : "volume-2", 24);
      soundBtn.setAttribute("aria-pressed", String(!muted));
      soundBtn.setAttribute("aria-label", soundLabel()); soundBtn.title = soundLabel();
    }
  }
  function toggleSound(): void {
    muted = !muted; if (muted) options.audio.suspend();
    updateSoundButtonUi();
    save = { ...save, settings: { ...save.settings, muted } }; persist();
  }
  let shownLives = 3;
  function showLives(lives:number): void {
    if(lives===shownLives)return;shownLives=lives;
    el("[data-lives]").setAttribute("aria-label",`${t("Lives")}: ${lives}/3`);
    root.querySelectorAll<SVGElement>("[data-life]").forEach((heart,index)=>heart.classList.toggle("cb-heart-empty",index>=lives));
  }
  const renderer = new QuickTowerRenderer(el<HTMLCanvasElement>("canvas"), options.assets);
  renderer.setLocale(vi?"vi":"en");
  const listen = (target: EventTarget, event: string, callback: EventListener) => target.addEventListener(event, callback, { signal: abort.signal });
  listen(el("[data-tutorial-dismiss]"),"click",()=>{save=completeTutorial(save,tutorialMode);tutorial.hidden=true;persist();});
  function message(value: string): void { if (!disposed) notice.textContent = value; }
  function inferButtonIcon(label: string): LucideIconName | null {
    const l = label.toLowerCase();
    if (!l || l.length <= 2) return null;
    if (l.includes("play") || l.includes("chơi") || l.includes("resume") || l.includes("tiếp tục") || l.includes("start") || l.includes("bắt đầu") || l.includes("build selected") || l.includes("xây ô")) return "play";
    if (l.includes("pause") || l.includes("tạm dừng")) return "pause";
    if (l.includes("pvp") || l.includes("1v1") || l.includes("đấu")) return "swords";
    if (l.includes("mode") || l.includes("chế độ")) return "gamepad-2";
    if (l.includes("city") || l.includes("thành phố") || l.includes("district") || l.includes("quận") || l.includes("harbor") || l.includes("bến cảng") || l.includes("downtown")) return "building-2";
    if (l.includes("daily") || l.includes("hằng ngày")) return "calendar";
    if (l.includes("one drop")) return "target";
    if (l.includes("rush")) return "zap";
    if (l.includes("sprint")) return "timer";
    if (l.includes("statistic") || l.includes("thống kê")) return "bar-chart-3";
    if (l.includes("history") || l.includes("lịch sử") || l.includes("tháp của tôi")) return "history";
    if (l.includes("progression") || l.includes("tiến trình") || l.includes("xp") || l.includes("mission") || l.includes("nhiệm vụ")) return "sparkles";
    if (l.includes("book") || l.includes("sổ kiến trúc") || l.includes("customize") || l.includes("tùy chỉnh") || l.includes("skin")) return "book-open";
    if (l.includes("guide") || l.includes("hướng dẫn") || l.includes("rule") || l.includes("luật")) return "help-circle";
    if (l.includes("replay") || l.includes("retry") || l.includes("restart") || l.includes("thử lại") || l.includes("xây lại") || l.includes("phát lại")) return "rotate-ccw";
    if (l.includes("home") || l.includes("trang chủ")) return "home";
    if (l.includes("back") || l.includes("previous") || l.includes("trước") || l.includes("quay lại") || l.includes("về ")) return "chevron-left";
    if (l.includes("next") || l.includes("tiếp")) return "chevron-right";
    if (l.includes("setting") || l.includes("cài đặt")) return "settings";
    if (l.includes("ghost")) return "eye";
    if (l.includes("bot")) return "bot";
    if (l.includes("buy") || l.includes("mua") || l.includes("coin") || l.includes("pot") || l.includes("xu")) return "coins";
    if (l.includes("equip") || l.includes("trang bị") || l.includes("accept") || l.includes("nhận") || l.includes("ready") || l.includes("sẵn sàng")) return "check";
    return null;
  }
  function button(label: string, action: () => void, explicitIcon?: LucideIconName, extraClass?: string): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    if (extraClass) b.className = extraClass;
    const icon = explicitIcon ?? inferButtonIcon(label);
    if (icon) {
      b.innerHTML = `${lucideSvg(icon, 14)}<span></span>`;
      b.querySelector("span")!.textContent = label;
    } else {
      b.textContent = label;
    }
    b.addEventListener("click", action);
    return b;
  }
  function showPanel(title: string, body: string, actions: HTMLButtonElement[]): void {
    tutorial.hidden=true;
    replayControls.hidden=true;
    oneDropMenuOpen=false;
    perfectRushMenuOpen=false;
    skylineSprintMenuOpen=false;
    gameMenuOpen=false;
    delete panel.dataset.menuScreen;
    panel.removeAttribute("aria-modal");
    dataScreens.clear();
    dailyScreens.clear();
    progressionScreens.clear();
    bookScreens.clear();
    districtScreens.clear();
    pvpScreens.clear();
    panel.classList.remove("cb-city-panel", "cb-guide-panel", "cb-result-panel", "cb-data-panel", "cb-history-panel", "cb-districts-panel", "cb-pvp-panel", "cb-home-panel", "cb-screen", "cb-menu-panel", "cb-pause-panel", "cb-quick-result-panel", "cb-loading-panel");
    panel.replaceChildren(); panel.hidden = false;
    const heading = document.createElement("h2"); heading.textContent = title;
    const text = document.createElement("p"); text.textContent = body;
    const buttons = document.createElement("div"); buttons.className = "cb-actions"; buttons.append(...actions);
    panel.append(heading, text, buttons); panel.setAttribute("aria-label",title);panel.tabIndex=-1;
    const firstEnabled=actions.find(b=>!b.disabled);if(firstEnabled)firstEnabled.focus({preventScroll:true});else panel.focus({preventScroll:true});
  }
  /** Opens the panel as a custom minimal screen; the title stays for screen readers only. */
  function screen(title: string, className: string): HTMLElement {
    showPanel(title, "", []);
    panel.classList.add("cb-screen", className);
    panel.querySelector("h2")!.className = "cb-sr-only";
    panel.querySelector("p")!.remove();
    panel.querySelector(".cb-actions")!.remove();
    return panel;
  }
  function showLoading(title: string): void {
    screen(title, "cb-loading-panel").append(node("span", "cb-spinner"));
  }
  function showStats(stats: [string,string][]): void {
    panel.classList.add("cb-result-panel");
    const grid=document.createElement("dl");grid.className="cb-stats";
    for(const [label,value] of stats) {
      const card=document.createElement("div"),term=document.createElement("dt"),detail=document.createElement("dd");
      term.textContent=label;detail.textContent=value;card.append(term,detail);grid.append(card);
    }
    panel.querySelector(".cb-actions")!.before(grid);
  }
  let scoreState: ScoreSyncState | null = options.score?.getState?.() ?? null;
  function scoreBadgeText(state: ScoreSyncState): string {
    if (state.status === "synced") return wt("Score synced", "Đã đồng bộ điểm");
    if (state.status === "error" || (state.status === "pending" && (state.retryAttempt ?? 0) > 0)) return wt("Score pending retry", "Điểm chờ gửi lại");
    return wt("Score pending sync", "Điểm chờ đồng bộ");
  }
  function syncScoreUi(): void {
    if (disposed || !scoreState) return;
    notice.dataset.scoreStatus = scoreState.status;
    const badge = panel.querySelector<HTMLElement>("[data-score-status]");
    if (badge) {
      badge.dataset.scoreStatus = scoreState.status;
      badge.textContent = scoreState.status === "idle" ? "" : ` · ${scoreBadgeText(scoreState)}`;
    }
    const retrying = scoreState.status === "error" || (scoreState.status === "pending" && (scoreState.retryAttempt ?? 0) > 0);
    if (retrying && storageWritable && rewardSaveStatus !== "error") {
      notice.dataset.scoreNotice = "true";
      message(wt("Score pending sync — saved locally and retrying automatically.", "Điểm đang chờ đồng bộ — đã lưu cục bộ và tự thử lại."));
    } else if (notice.dataset.scoreNotice === "true" && !retrying) {
      delete notice.dataset.scoreNotice;
      if (storageWritable && rewardSaveStatus !== "error") message("");
    }
  }
  if (options.score?.onStateChange) {
    cleanups.push(options.score.onStateChange(state => { scoreState = state; syncScoreUi(); }));
  }
  function persist(): void {
    if (!storageWritable) { rewardSaveStatus = "error"; return; }
    if (!ready || saveTimer) return;
    rewardSaveStatus = "pending"; saveGeneration++;
    // Serialization runs in a separate task, never inside the drop/RAF call stack.
    saveTimer = window.setTimeout(flushSave, 0);
  }
  function flushSave(): void {
    window.clearTimeout(saveTimer); saveTimer = 0;
    if (!storageWritable || !ready) return;
    const generation = saveGeneration;
    rewardSaveStatus = "pending";
    let value: GameSave;
    try { value = prepareSave(save); save = { ...value }; }
    catch { rewardSaveStatus = "error"; delete notice.dataset.scoreNotice; message(t("Save exceeds its budget. Your previous saved progress is preserved.")); return; }
    void saveController.write(value).then(success => {
      if (generation !== saveGeneration) return;
      rewardSaveStatus = success ? "saved" : "error";
      if (!success) { delete notice.dataset.scoreNotice; message(t("Save failed. Your result is kept for this session; retry saving.")); }
      else if (notice.dataset.scoreNotice !== "true") message("");
      if (success && (userPaused || !run || run.getPhase() === "ended")) void options.save.flush?.();
      progressionScreens.tick(); bookScreens.tick();
    });
  }
  const dataScreens = createDataScreens({ panel, save: () => save, t, className, showPanel, showStats, button, home,
    replay: record => { dataScreens.clear(); void startReplay(record); },
    pin: id => { save = pinReplay(save, id); persist(); },
    toggleHallOfFame: id => { save = toggleHallOfFame(save, id); persist(); },
    updateSave: next => { save = next; persist(); },
    assets: options.assets,
    now });
  const dailyScreens = createDailyScreens({ panel, save: () => save, now, t, button, showPanel, showStats, home,
    vi: () => vi, screen, resultScreen: showResultScreen, coins: runCoinsLabel,
    online:options.ranked ? {label:()=>wt("Ranked Daily","Daily xếp hạng"),start:()=>{void startOnline("daily");}} : undefined,
    start: date => { void startDaily(date); }, resume: () => { void resumeDaily(); }, discard: discardDaily,
    replay: record => { void startReplay(record); } });
  const progressionLabel = () => vi ? "Tiến trình" : "Progression";
  const progressionResultLabel = () => vi ? "XP và nhiệm vụ" : "XP & missions";
  const progressionScreens = createProgressionScreens({ panel, save: () => save, now, locale: () => vi ? "vi" : "en", className, showPanel, button, home,
    claim: (date, id) => { if (rewardSaveStatus === "pending") return; save = claimMission(save, date, id, now()); persist(); },
    reroll: (date, id) => { if (rewardSaveStatus === "pending") return; save = rerollSaveMission(save, date, id, now()); persist(); },
    claimWeekly: (weekStartUTC, id) => { if (rewardSaveStatus === "pending") return; save = claimWeeklyContract(save, weekStartUTC, id, now(), liveOpsManifest); persist(); },
    claimEventGoal: goalId => { if (rewardSaveStatus === "pending") return; save = claimWinterEventGoal(save, goalId, now(), liveOpsManifest); persist(); },
    claimSeasonTier: tier => { if (rewardSaveStatus === "pending") return; save = claimSeasonTier(save, tier, now(), liveOpsManifest); persist(); },
    liveOpsManifest: () => liveOpsManifest,
    retry: persist, status: () => rewardSaveStatus, paused: () => hostPaused || userPaused, reducedMotion: () => reducedMotion });
  const bookLabel = () => vi ? "Sổ kiến trúc" : "Architecture Book";
  const bookScreens = createBookScreens({ panel, renderer, assets:options.assets, save: () => save, vi: () => vi, className, showPanel, screen, button, home, saveStatus: () => rewardSaveStatus, retrySave: persist,
    equip: (id,equipment) => { if(rewardSaveStatus === "pending")return;let next=save;for(const item of [equipment.building,equipment.roof,equipment.crane])next=equipCosmetic(next,item,id);save=next;persist(); },
    buy: itemId => { if(rewardSaveStatus === "pending")return;try{save=buyCosmeticWithCoins(save,itemId,now());paint();persist();}catch{/* ignore */}} });
  let harborBgFailed = false;
  async function switchDistrict(districtId: DistrictId): Promise<void> {
    if (!save.districts.unlockedDistricts.includes(districtId)) return;
    if (districtId === "harbor") {
      const ok = await preloadDistrictBackground(`${options.assets.replace(/\/$/, "")}/bg/harbor/bg_harbor_default_map.png`);
      harborBgFailed = !ok;
    }
    save = selectDistrict(save, districtId);
    persist();
    cityMap();
  }
  const districtScreens = createDistrictScreens({
    panel,
    assets: options.assets,
    save: () => save,
    vi: () => vi,
    className,
    showPanel,
    button,
    selectDistrict: switchDistrict,
    updateSave: next => { save = next; persist(); },
    backToMap: cityMap,
  });
  const pvpScreens = createPvpScreens({
    arena,
    panel,
    renderer,
    assets: options.assets,
    pvp: options.pvp,
    save: () => save,
    updateSave: next => { save = next; paint(); persist(); },
    vi: () => vi,
    now,
    installationId,
    showPanel,
    screen,
    button,
    home,
    openBook,
    startPvpRun: async (room) => {
      await start(false, false, { seed: room.seed, mode: "quick", assist: false, building: room.building });
    },
    message,
  });
  function openPvp(roomCode?: string): void {
    checkpointCity(); abandonQuick(); cityActive = false; mapView = false;
    cancelFrame(); run = null; replay = null; userPaused = false; celebrating = false; renderer.resetEffects(); renderer.setOpponentTower(null); paint();
    pvpScreens.openLobby(roomCode);
  }
  const dailyTimer = window.setInterval(() => { if (!hostPaused && !disposed) {
    if (ready) {
      let next = ensureMissions(save, now());
      next = ensureWeeklyContracts(next, now(), liveOpsManifest);
      if (next !== save) { save = next; persist(); }
    }
    dailyScreens.tick(); progressionScreens.tick(); bookScreens.tick();
  } }, 1000);
  cleanups.push(() => window.clearInterval(dailyTimer));
  function openData(history = false): void {
    if(options.presentation === "content" && options.onNavigate){options.onNavigate(history?"history":"statistics");return;}
    checkpointCity(); abandonQuick(); cityActive = false; mapView = false;
    cancelFrame(); run = null; replay = null; userPaused = false; celebrating = false; renderer.resetEffects(); paint();
    if (history) dataScreens.history(); else dataScreens.statistics();
  }
  function openProgression(): void {
    if (featureFlags.meta === false) {
      message(wt("Progression is temporarily paused for maintenance. Saved XP and unlocks are preserved.","Tiến trình đang tạm dừng bảo trì. XP và mở khoá đã lưu vẫn được giữ nguyên."));
      home();
      return;
    }
    checkpointCity(); abandonQuick(); cityActive = false; mapView = false;
    cancelFrame(); run = null; replay = null; userPaused = false; celebrating = false; renderer.resetEffects(); paint();
    save = ensureWeeklyContracts(ensureMissions(save, now()), now(), liveOpsManifest); persist(); progressionScreens.menu();
  }
  function openBook(): void {
    if (featureFlags.cosmetics === false) {
      message(wt("Architecture Book is temporarily paused for maintenance. Owned cosmetics remain saved.","Sổ kiến trúc đang tạm dừng bảo trì. Vật phẩm đã sở hữu vẫn được giữ nguyên."));
      home();
      return;
    }
    checkpointCity();abandonQuick();cityActive=false;mapView=false;cancelFrame();run=null;replay=null;userPaused=false;celebrating=false;renderer.resetEffects();paint();bookScreens.book();
  }
  async function loadRunArtwork(id:BuildingId,equipment:RunEquipment):Promise<void> {
    try { await renderer.loadEquipment(id,equipment); }
    catch { message(t("Using fallback building art."));try{await renderer.loadBuilding(id);}catch{/* Colored fallback remains usable. */} }
    renderer.setEquipment(equipment);
  }
  function rewardRoundButton(back: () => void): HTMLButtonElement | null {
    if (featureFlags.meta === false) return null;
    const summary = save.history.find(h => h.identity.id === runContext?.identity.id);
    return summary ? roundButton("sparkles", progressionResultLabel(), () => progressionScreens.result(summary, back), "cb-round-lg") : null;
  }
  function runCoinsLabel(): string | undefined {
    const earned = save.history.find(h => h.identity.id === runContext?.identity.id)?.coinsEarned ?? 0;
    return earned > 0 ? `+${formatNumber(earned, vi)}` : undefined;
  }
  function saveRetryButton(): HTMLButtonElement | null {
    return rewardSaveStatus === "error" ? roundButton("alert-triangle", t("Retry save"), persist, "cb-round-lg cb-round-warn") : null;
  }
  /** Shared minimal result layout: one card, one big action, a row of round icon actions. */
  function showResultScreen(title: string, card: Parameters<typeof resultCard>[0], primary: HTMLButtonElement, secondary: (HTMLButtonElement | null)[], extra: HTMLElement[] = []): void {
    screen(title, "cb-quick-result-panel");
    const wrap = node("div", "cb-result");
    const resultCardEl = resultCard(card);
    resultCardEl.append(...extra);
    const row = node("div", "cb-result-row");
    row.append(...secondary.filter((b): b is HTMLButtonElement => !!b));
    const actions = node("div", "cb-result-actions");
    actions.append(primary, row);
    wrap.append(resultCardEl, actions);
    panel.append(wrap);
    primary.focus({ preventScroll: true });
  }
  function rewardButton(back: () => void): HTMLButtonElement | null {
    if (featureFlags.meta === false) return null;
    const summary = save.history.find(h => h.identity.id === runContext?.identity.id);
    return summary ? button(progressionResultLabel(), () => progressionScreens.result(summary, back)) : null;
  }
  function ensurePendingContext(startedAt = 0): void {
    const pending = save.city.pending;
    if (!pending || save.tracking.pendingCity?.cityRunId === pending.runId) return;
    const allocated = allocateRun(save, startedAt); save = allocated.save;
    save = { ...save, tracking: { ...save.tracking, pendingCity: { ...allocated.context, equipment: pending.equipment ?? { ...DEFAULT_EQUIPMENT }, cityRunId: pending.runId } } };
  }
  function settleCurrent(): void {
    if (!run || !runContext || isSettled(save, runContext.identity) || run.getPhase() !== "ended") return;
    const summary = makeSummary(run, runContext, now());
    if (run.config.mode !== "city") finishedRecord = run.getRecord();
    save = completeTutorial(settleRun(save, summary, run.config.mode !== "city" ? finishedRecord! : undefined),run.config.mode); persist();
    if (rankedId && finishedRecord) void options.ranked?.complete(rankedId,finishedRecord).catch(() => message(wt("Online result could not be queued. Open Ranked to retry; personal progress is kept.","Chưa lưu được kết quả online. Mở Xếp hạng để thử lại; giữ kết quả cá nhân.")));
  }
  function abandonQuick(): void {
    options.audio.setCombo?.(0);
    if (!run || !["quick", "perfect-rush", "skyline-sprint"].includes(run.config.mode) || replay || !runContext) return;
    if (run.getPhase() === "ended") settleCurrent();
    else if (!isSettled(save, runContext.identity)) { save = settleRun(save, makeSummary(run, runContext, now(), "abandoned")); persist(); void options.ranked?.abandon(runContext.identity.id).catch(()=>{}); }
    rankedId = null;
    runContext = null;
  }
  function discardPendingCity(): void {
    const pending = save.city.pending; if (!pending) return;
    ensurePendingContext();
    const game = cityActive && run ? run : restoreTower(pending.checkpoint), context = save.tracking.pendingCity!;
    save = settleRun(save, makeSummary(game, context, now(), game.getPhase() === "ended" ? "ended" : "abandoned"));
    save = { ...save, city: cancelCityTower(save.city), tracking: { ...save.tracking, pendingCity: null } };
    runContext = null; cityActive = false; persist();
  }
  function syncReplayControls(): void {
    if (!replay || !panel.hidden) {
      replayControls.hidden = true;
      return;
    }
    replayControls.hidden = false;
    const speed = replay.getSpeed();
    for (const btn of replayControls.querySelectorAll<HTMLButtonElement>("[data-replay-speed]")) {
      const btnSpeed = Number(btn.dataset.replaySpeed);
      btn.setAttribute("aria-pressed", String(btnSpeed === speed));
    }
    const scrubBtn = replayControls.querySelector<HTMLButtonElement>("[data-replay-scrub-pause]");
    if (scrubBtn) {
      scrubBtn.textContent = replayScrubPaused ? wt("Play", "Phát") : wt("Step pause", "Tạm dừng xem");
      scrubBtn.setAttribute("aria-pressed", String(replayScrubPaused));
    }
    const tickLabel = replayControls.querySelector<HTMLElement>("[data-replay-tick]");
    if (tickLabel) {
      tickLabel.textContent = `${replay.getTick()}/${replay.record.endTick}t`;
    }
  }
  function buildReplayControls(): void {
    replayControls.replaceChildren();
    if (!replay) return;
    const scrubBtn = button(wt("Step pause", "Tạm dừng xem"), () => {
      if (!replay) return;
      replayScrubPaused = !replayScrubPaused;
      replay.setPaused(replayScrubPaused || userPaused || hostPaused);
      syncReplayControls();
      if (!replayScrubPaused) {
        if (replay.getSnapshot().phase === "ended") {
          results(true);
        } else {
          lastTime = 0;
          schedule();
        }
      }
    });
    scrubBtn.dataset.replayScrubPause = "true";
    replayControls.append(scrubBtn);

    for (const s of REPLAY_SPEEDS) {
      const sb = button(`${s}×`, () => {
        if (!replay) return;
        replay.setSpeed(s as ReplaySpeed);
        syncReplayControls();
      });
      sb.dataset.replaySpeed = String(s);
      sb.setAttribute("aria-pressed", String(replay.getSpeed() === s));
      replayControls.append(sb);
    }

    const restartBtn = button(wt("Reset", "Đầu"), () => {
      if (!replay) return;
      replayScrubPaused = false;
      replay.restart();
      replay.setPaused(userPaused || hostPaused);
      lastFeedback = 0;
      renderer.resetEffects();
      paint();
      syncReplayControls();
      lastTime = 0;
      schedule();
    }, "rotate-ccw");
    restartBtn.dataset.replayRestart = "true";
    restartBtn.title = t("Restart replay");
    replayControls.append(restartBtn);

    const markers = replay.getDropMarkers();
    const select = document.createElement("select");
    select.className = "cb-replay-select";
    select.dataset.replayDropSelect = "true";
    select.setAttribute("aria-label", wt("Jump to drop", "Nhảy tới lần thả"));
    const startOpt = document.createElement("option");
    startOpt.value = "-1";
    startOpt.textContent = wt("0t · Start", "0t · Bắt đầu");
    select.append(startOpt);
    for (const m of markers) {
      const opt = document.createElement("option");
      opt.value = String(m.sequence);
      const labelKind = m.isRoof ? wt("Roof", "Mái") : m.isFoundation ? wt("Base", "Móng") : `D${m.sequence + 1}`;
      opt.textContent = `#${m.sequence + 1} ${labelKind} · ${m.quality.toUpperCase()} (${m.landingTick}t)`;
      select.append(opt);
    }
    select.addEventListener("change", () => {
      if (!replay) return;
      const idx = Number(select.value);
      replayScrubPaused = true;
      if (idx < 0) replay.seekToTick(0);
      else replay.seekToDrop(idx);
      replay.setPaused(true);
      const snap = replay.getSnapshot();
      lastFeedback = snap.feedbackId;
      renderer.resetEffects(snap.feedbackId);
      paint(snap);
      syncReplayControls();
    });
    replayControls.append(select);

    const endBtn = button(wt("End", "Cuối"), () => {
      if (!replay) return;
      replayScrubPaused = true;
      replay.seekToResult();
      replay.setPaused(true);
      const snap = replay.getSnapshot();
      lastFeedback = snap.feedbackId;
      renderer.resetEffects(snap.feedbackId);
      paint(snap);
      syncReplayControls();
    });
    endBtn.dataset.replaySeekResult = "true";
    replayControls.append(endBtn);

    const tickSpan = document.createElement("span");
    tickSpan.dataset.replayTick = "true";
    tickSpan.textContent = `${replay.getTick()}/${replay.record.endTick}t`;
    replayControls.append(tickSpan);
  }
  const idleSnapshot = new QuickTowerGame(1).getSnapshot();
  function current() { return replay?.getSnapshot() ?? run?.getSnapshot() ?? idleSnapshot; }
  function paint(s = current()): void {
    renderer.render(s, replay?.getPreviousRenderSnapshot(s) ?? run?.getPreviousRenderSnapshot(s), replay?.getInterpolationAlpha() ?? run?.getInterpolationAlpha() ?? 1, reducedMotion);
    setText("[data-coins]", String(save.coins ?? 200));
    if(mapView&&!run&&!replay) {
      const activeDistrict = save.districts.activeDistrict;
      const districtState = activeDistrict === "harbor" ? save.districts.harbor : save.districts.downtown;
      setText("[data-mode]","");
      showLives(3);
      setText("[data-population]",String(totalCityPopulation(save)));
      setText("[data-floors]",String(districtState.lots.reduce((sum,lot)=>sum+(lot?.floors??0),0)));
      combo.parentElement!.hidden=true;pauseButton.disabled=true;
      setText(".cb-hint",t("Complete a tier to unlock the next. A roof is a separate drop."));
      return;
    }
    const daily = replay?.record.config.daily ?? run?.config.daily;
    const oneDrop = replay?.record.config.oneDrop ?? run?.config.oneDrop;
    const perfectRush = replay?.record.config.perfectRush ?? run?.config.perfectRush;
    const skylineSprint = replay?.record.config.skylineSprint ?? run?.config.skylineSprint;
    setText("[data-population]", String(s.population));
    setText("[data-floors]", oneDrop ? `${Math.max(0, s.floors.length - oneDrop.prebuiltFloors)}/${oneDrop.targetBodyFloors}` : skylineSprint ? `${s.floors.length}/${skylineSprint.targetBodyFloors}` : s.targetFloors ? `${s.floors.length}/${s.targetFloors}${s.isRoof && !s.roof ? " ▲" : ""}` : String(s.floors.length));
    showLives(s.lives);
    const odBest = oneDrop ? save.oneDrop.days.find(d => d.dateUTC === oneDrop.dateUTC)?.best : null;
    const prBest = perfectRush ? save.liveOps?.perfectRush?.best : null;
    const spBest = skylineSprint ? save.liveOps?.skylineSprint?.bestComplete : null;
    setText("[data-best]", oneDrop ? (odBest ? `${(odBest.absError * 100).toFixed(1)}%` : "0") : perfectRush ? `${prBest?.perfectCount ?? 0} P` : skylineSprint ? (spBest ? `${(spBest.sprintScoreTicks / 60).toFixed(1)}s` : "0") : String(daily ? save.daily.days.find(d => d.dateUTC === daily.dateUTC)?.bestComplete?.result.population ?? 0 : s.assist ? save.assistQuickBest : save.standardQuickBest));
    const comboOn = s.comboLevel > 0 && s.comboRatio > 0 && panel.hidden;
    combo.parentElement!.hidden = !comboOn;
    if (comboOn) { setText(".cb-combo span", `x${s.comboLevel}`); combo.parentElement!.style.setProperty("--cb-combo-ratio", s.comboRatio.toFixed(3)); }
    const rushSecondsLeft = perfectRush ? Math.max(0, Math.ceil((perfectRush.deadlineTick - Math.min(perfectRush.deadlineTick, s.tick)) / 60)) : 0;
    const sprintElapsedSec = skylineSprint ? ((s.tick + (3 - s.lives) * skylineSprint.missPenaltyTicks) / 60).toFixed(1) : "0.0";
    // Only modes with a clock or a special state need a chip; plain runs stay clean.
    setText("[data-mode]", replay ? t("Replay") : oneDrop ? "1 Drop" : perfectRush ? `${rushSecondsLeft}s · ${s.perfectCount} P` : skylineSprint ? `${sprintElapsedSec}s` : rankedId ? wt("Ranked", "Xếp hạng") : "");
    pauseButton.disabled = !run && !replay || s.phase === "ended" && !celebrating;
    let hintText = !replay ? oneDrop ? wt("One Drop · Land 1 block on the swaying 4-floor tower with minimal error.", "One Drop · Thả 1 khối lên tháp 4 tầng đang lắc với độ lệch nhỏ nhất.") : perfectRush ? wt("Perfect Rush · 60s clock, 3 lives, no roof. Maximize Perfect placements!", "Perfect Rush · 60 giây, 3 mạng, không mái. Tối đa hoá số lần Hoàn hảo!") : skylineSprint ? wt("Skyline Sprint · Reach 20 floors fastest (+5s per Miss, no roof).", "Skyline Sprint · Đạt 20 tầng nhanh nhất (+5 giây mỗi lần trượt, không mái).") : s.drops.length === 0 ? t("1/3 · Tap, click, Space or Enter to drop one floor.") :
      s.drops.length === 1 ? t("2/3 · Aim at the moving top of the tower. Three misses end the run.") :
      s.drops.length === 2 ? t("3/3 · Perfect refreshes combo and steadies the tower.") : t("Drop on the tower · Perfect keeps the combo alive") : t("Recorded inputs · Replay never submits a score");
    if (s.targetFloors && !oneDrop && !skylineSprint && s.isRoof && s.phase !== "ended") hintText = t("Final drop: place the roof. You only get one attempt.");
    setText(".cb-hint", hintText);
    if(run?.config.mode === "quick" && !replay && panel.hidden && !save.tutorials.quick){
      if(s.drops.length>=3){save=completeTutorial(save,"quick");tutorial.hidden=true;persist();}
      else tutorialHint("quick",s.drops.length === 0 ? wt("Tap to drop", "Chạm để thả") : s.drops.length === 1 ? wt("Aim at the tower top", "Canh đỉnh tháp") : wt("Perfect keeps the combo", "Perfect giữ combo"));
    }else if(panel.hidden || replay) tutorial.hidden=true;
    syncReplayControls();
  }
  function cancelFrame(): void { cancelAnimationFrame(raf); raf = 0; lastTime = 0; }
  function schedule(): void { if (!disposed && !raf && !userPaused && !hostPaused && !replayScrubPaused && (run || replay) && ((replay?.getPhase() ?? run?.getPhase()) !== "ended" || celebrating)) raf = requestAnimationFrame(frame); }
  function applyGhost(config: RunConfig): void {
    if (!ghostEnabled) {
      renderer.setGhost(null);
      return;
    }
    const res = resolvePersonalGhost(save, config);
    renderer.setGhost(res.status === "available" ? res.ghost : null);
  }
  async function start(assist = false, ranked = false, customConfig?: RunConfig): Promise<void> {
    const generation=++startGeneration;
    mapView=false;
    checkpointCity(); abandonQuick(); cityActive = false;
    cancelFrame(); replay = null; replayScrubPaused = false; finishedRecord = null;
    run = null;pauseButton.disabled=true;
    renderer.resetEffects(); renderer.setGhost(null); celebrating = false;
    showLoading(t("Preparing tower"));
    // Lazy assets still load only after Play, but decoding never competes with a moving crane.
    const buildingId = customConfig?.building ?? "residential";
    const equipment=equipmentFor(save,buildingId);await loadRunArtwork(buildingId,equipment);if(disposed||generation!==startGeneration)return;
    const ticket = ranked ? await options.ranked!.start("quick") : null;
    if(disposed||generation!==startGeneration)return;
    rankedId=ticket?.id ?? null;
    run = new QuickTowerGame(ticket?.config ?? customConfig ?? { seed: options.seed(), mode: "quick", assist });
    applyGhost(run.config);
    const previousSave=save;
    const allocated = allocateRun(save, now()); save = allocated.save; runContext = { ...allocated.context,equipment };
    try { if(ticket)await options.ranked!.bind(ticket.id,runContext.identity.id); } catch(error) { save=previousSave;run=null;runContext=null;rankedId=null;throw error; }
    if(disposed||generation!==startGeneration)return;
    save = { ...save, tracking: { ...save.tracking, activeQuick: { ...runContext, progress: makeSummary(run, runContext, now(), "abandoned") } } }; persist();
    if(ticket){flushSave();await saveController.flush();if(rewardSaveStatus==="error"){void options.ranked!.abandon(runContext.identity.id).catch(()=>{});save=previousSave;run=null;runContext=null;rankedId=null;throw new Error("storage");}}
    if(disposed||generation!==startGeneration)return;
    lastFeedback = 0; userPaused = false;
    panel.hidden = true; updatePauseButtonUi(); arena.focus(); paint();
    syncPause(); schedule();
  }
  async function startReplay(record: RunRecord): Promise<void> {
    startGeneration++;
    if(options.presentation === "content" && options.onNavigate){options.onNavigate("history",save.replays.find(r=>r.record===record)?.id);return;}
    mapView=false;
    checkpointCity(); abandonQuick(); cityActive = false;
    rankedId=null;
    try { replay = new QuickTowerReplay(record); } catch { message(t("Replay is incompatible.")); return; }
    cancelFrame(); run = null; userPaused = false; replayScrubPaused = false; lastFeedback = 0;
    renderer.resetEffects(); renderer.setGhost(null); celebrating = false;
    pauseButton.disabled=true;
    showLoading(t("Preparing replay"));
    const entry=save.replays.find(r=>r.record===record||JSON.stringify(r.record)===JSON.stringify(record));
    const equipment=save.history.find(h=>h.identity.id===entry?.id)?.equipment??{...DEFAULT_EQUIPMENT};
    await loadRunArtwork(record.config.building ?? "residential",equipment);if(disposed)return;
    buildReplayControls();
    panel.hidden = true; updatePauseButtonUi(); paint(); syncPause(); schedule();
  }
  function leaveRun(): void {
    startGeneration++;
    mapView = false;
    checkpointCity(); abandonQuick(); cityActive = false;
    cancelFrame(); run = null; replay = null; replayScrubPaused = false; userPaused = false;
    renderer.setGhost(null); renderer.setOpponentTower(null); paint();
    rankedId = null; celebrating = false; renderer.resetEffects();
  }
  // One sheet replaces the old Utilities + Settings screens: big tiles, one or two words each.
  function openMenu(): void {
    leaveRun();
    screen(wt("Menu", "Menu"), "cb-menu-panel");
    gameMenuOpen = true;
    panel.dataset.menuScreen = "menu";
    const sheet = node("div", "cb-sheet");
    const head = node("div", "cb-sheet-head");
    head.append(node("span", "cb-sheet-grip"), roundButton("x", t("Home"), home, "cb-sheet-close"));
    const grid = node("div", "cb-tile-grid");
    if (featureFlags.cosmetics !== false) grid.append(tile({ icon: "palette", tone: "green", label: wt("Skins", "Skin"), value: formatNumber(save.coins ?? 0, vi), valueIcon: "coins", action: openBook }));
    if (featureFlags.meta !== false) grid.append(tile({ icon: "sparkles", tone: "gold", label: wt("Missions", "Nhiệm vụ"), action: openProgression }));
    grid.append(tile({ icon: "bar-chart-3", tone: "blue", label: t("Statistics"), action: () => openData(false) }));
    grid.append(tile({ icon: "history", tone: "slate", label: t("History"), action: () => openData(true) }));
    if (save.lastReplay) grid.append(tile({ icon: "rotate-ccw", tone: "purple", label: wt("Replay", "Xem lại"), action: () => { void startReplay(save.lastReplay!); } }));
    grid.append(tile({ icon: "help-circle", tone: "slate", label: t("Guide"), action: () => showGuide(0, openMenu) }));
    if (options.showSoundControl !== false) {
      const sound = tile({ icon: muted ? "volume-x" : "volume-2", tone: muted ? "slate" : "red", label: wt("Sound", "Âm thanh"), pressed: !muted, action: () => { toggleSound(); openMenu(); } });
      sound.dataset.settingToggle = "sound";
      grid.append(sound);
    }
    const language = tile({ icon: "globe", tone: "blue", label: vi ? "Tiếng Việt" : "English", value: vi ? "VI" : "EN", action: () => { const next = vi ? "en" : "vi"; setLocale(next); options.onLocaleChange?.(next); openMenu(); } });
    language.dataset.settingToggle = "language";
    const ghost = tile({ icon: "eye", tone: ghostEnabled ? "purple" : "slate", label: "Ghost", pressed: ghostEnabled, action: () => { ghostEnabled = !ghostEnabled; openMenu(); } });
    ghost.dataset.settingToggle = "ghost";
    grid.append(language, ghost);
    if (!storageWritable) grid.append(tile({ icon: "alert-triangle", tone: "red", label: t("Recover saved progress"), action: confirmRecovery }));
    sheet.append(head, grid);
    panel.append(sheet);
    grid.querySelector("button")?.focus({ preventScroll: true });
  }

  function home(): void {
    if(options.presentation === "content" && ready && options.onNavigate){startGeneration++;options.onNavigate("quick");return;}
    leaveRun();
    screen(quickName(), "cb-home-panel");
    panel.dataset.menuScreen = "home";
    const wrap = node("div", "cb-home");
    const top = node("div", "cb-home-top");
    const coins = node("button", "cb-coin-pill");
    coins.type = "button"; coins.dataset.coinPill = "true";
    coins.append(icon("coins", 22), node("strong", "", formatNumber(save.coins ?? 0, vi)));
    coins.setAttribute("aria-label", `${wt("Coins", "Xu")}: ${save.coins ?? 0}`);
    coins.title = wt("Coins", "Xu");
    coins.addEventListener("click", featureFlags.cosmetics !== false ? openBook : openMenu);
    const menuBtn = roundButton("menu", wt("Menu", "Menu"), openMenu);
    menuBtn.dataset.openMenu = "true";
    top.append(coins, menuBtn);
    const mark = node("h2", "cb-wordmark");
    mark.setAttribute("aria-label", "City Bloxx");
    mark.append(node("span", "", "CITY"), node("span", "", "BLOXX"));
    const play = node("button", "cb-play-big");
    play.type = "button"; play.innerHTML = lucideSvg("play", 64);
    play.setAttribute("aria-label", t("Play Standard")); play.title = t("Play Standard");
    play.dataset.heroPlay = "true"; play.dataset.playStandard = "true";
    play.addEventListener("click", () => { void start(); });
    const best = pill("trophy", formatNumber(save.standardQuickBest, vi), t("Best"), "cb-best-pill");
    const tiles = node("div", "cb-home-tiles");
    tiles.append(tile({ icon: "building-2", tone: "blue", label: wt("City", "Thành phố"), value: formatNumber(totalCityPopulation(save), vi), valueIcon: "users", dot: !!save.city.pending, action: cityMap }));
    if (featureFlags.daily !== false || save.daily.pending) {
      const today = utcDate(now());
      tiles.append(tile({ icon: "calendar", tone: "red", label: wt("Daily", "Hằng ngày"), value: String(currentDailyStreak(save.daily, today)), valueIcon: "flame", dot: !save.daily.creditedDates.includes(today), action: openDaily }));
    }
    if (options.pvp) {
      const pvp = tile({ icon: "swords", tone: "purple", label: "Solo 1v1", action: () => openPvp() });
      pvp.dataset.openPvp = "true";
      tiles.append(pvp);
    }
    if (options.ranked) tiles.append(tile({ icon: "crown", tone: "gold", label: wt("Ranked", "Xếp hạng"), action: () => { void startOnline("quick"); } }));
    tiles.dataset.count = String(tiles.childElementCount);
    wrap.append(top, mark, play, best, tiles);
    panel.append(wrap);
    play.focus({ preventScroll: true });
  }
  function openPerfectRush(): void {
    if (liveOpsManifest.killSwitch.rushDisabled) {
      message(wt("Perfect Rush is temporarily paused for maintenance.", "Perfect Rush đang tạm dừng bảo trì."));
      home();
      return;
    }
    startGeneration++;
    checkpointCity(); abandonQuick(); cancelFrame(); run = null; replay = null; replayScrubPaused = false; runContext = null; cityActive = false; mapView = false;
    rankedId = null; userPaused = false; celebrating = false; renderer.resetEffects(); renderer.setGhost(null); paint();
    const def = resolvePerfectRush();
    const prState = save.liveOps?.perfectRush;
    const best = prState?.best ?? null;
    const ghostResolution = resolvePersonalGhost(save, { mode: "perfect-rush", assist: false, seed: best?.seed ?? 0, building: "residential", perfectRush: def });
    const actions: HTMLButtonElement[] = [];
    const playBtn = button(wt("Play", "Chơi"), () => { void startPerfectRush(); });
    playBtn.dataset.perfectRushStart = "true";
    actions.push(playBtn);
    if (best) {
      const replayEntry = save.replays.find(r => r.id === best.identityId);
      if (replayEntry) {
        const watchBtn = button(t("Replay"), () => { void startReplay(replayEntry.record); });
        watchBtn.dataset.perfectRushReplay = "true";
        actions.push(watchBtn);
      }
    }
    const ghostBtn = button(`Ghost: ${ghostEnabled ? wt("On", "Bật") : wt("Off", "Tắt")}`, () => {
      ghostEnabled = !ghostEnabled;
      openPerfectRush();
    });
    ghostBtn.dataset.ghostToggle = "true";
    ghostBtn.setAttribute("aria-pressed", String(ghostEnabled));
    const guideBtn = button(wt("Rules", "Luật"), perfectRushGuide);
    guideBtn.dataset.perfectRushGuide = "true";
    actions.push(ghostBtn, guideBtn, button(t("Home"), home));
    showPanel(
      "Perfect Rush · 60s",
      wt("60s simulation · Residential · 3 lives · No roof · Ranked by Perfect body count.", "60 giây mô phỏng · Nhà ở · 3 mạng · Không mái · Xếp hạng theo số tầng Hoàn hảo."),
      actions,
    );
    perfectRushMenuOpen = true;
    panel.dataset.perfectRushScreen = "entry";
    showStats([
      [wt("Best Perfects", "Hoàn hảo cao nhất"), best ? String(best.perfectCount) : "—"],
      [t("Population"), best ? String(best.population) : "—"],
      [t("Floors"), best ? String(best.height) : "—"],
      [t("Accuracy"), best ? `${best.accuracy.toFixed(1)}%` : "—"],
      [wt("Attempts", "Số lượt"), String(prState?.attempts ?? 0)],
      ["Ghost", ghostResolution.status === "available" ? wt("Ready", "Sẵn sàng") : "—"],
    ]);
  }
  function perfectRushGuide(): void {
    showPanel(
      wt("Perfect Rush · Rules", "Perfect Rush · Luật chơi"),
      wt(
        "• 60s simulation timer (3600 ticks).\n• Residential class, no roof, 3 lives.\n• Ranked by Perfect body count, then population.\n• Earns body XP only (no finite completion bonus).\n• Separate PB; never overwrites Quick Tower.",
        "• Đồng hồ 60 giây mô phỏng (3600 tick).\n• Nhóm Nhà ở, không mái, 3 mạng.\n• Xếp hạng theo số tầng Hoàn hảo, sau đó dân số.\n• Chỉ nhận XP tầng thân (không thưởng hoàn thành hữu hạn).\n• Kỷ lục riêng; không ghi đè Quick Tower.",
      ),
      [button(t("Back"), openPerfectRush)],
    );
    perfectRushMenuOpen = true;
    panel.dataset.perfectRushScreen = "guide";
  }
  async function startPerfectRush(customSeed?: number): Promise<void> {
    if (liveOpsManifest.killSwitch.rushDisabled) return;
    const def = resolvePerfectRush();
    const generation = ++startGeneration;
    checkpointCity(); abandonQuick(); cancelFrame(); run = null; replay = null; replayScrubPaused = false; cityActive = false; mapView = false;
    rankedId = null;
    renderer.resetEffects(); renderer.setGhost(null); celebrating = false;
    showLoading(t("Preparing tower"));
    const equipment = equipmentFor(save, def.classId);
    await loadRunArtwork(def.classId, equipment);
    if (disposed || generation !== startGeneration) return;
    const seed = customSeed ?? options.seed();
    run = new QuickTowerGame({ mode: "perfect-rush", assist: false, seed, building: def.classId, perfectRush: def });
    applyGhost(run.config);
    const allocated = allocateRun(save, now());
    save = allocated.save;
    runContext = { ...allocated.context, equipment };
    finishedRecord = null;
    save = { ...save, tracking: { ...save.tracking, activeQuick: { ...runContext, progress: makeSummary(run, runContext, now(), "abandoned") } } };
    persist();
    lastFeedback = 0; userPaused = false;
    panel.hidden = true; pauseButton.textContent = t("Pause"); arena.focus(); paint(); syncPause(); schedule();
  }
  function perfectRushResults(isReplay = false): void {
    const record = isReplay ? replay!.record : run!.getRecord();
    const result = record.result;
    const prevBest = save.liveOps?.perfectRush?.best ?? null;
    if (!isReplay) settleCurrent();
    const newBest = save.liveOps?.perfectRush?.best ?? null;
    const retryBtn = button(wt("Retry Perfect Rush", "Thử lại Perfect Rush"), () => { void startPerfectRush(); });
    retryBtn.dataset.perfectRushRetry = "true";
    const actions: HTMLButtonElement[] = [
      retryBtn,
      button(t("Replay / restart"), () => { void startReplay(record); }),
      button("Perfect Rush", openPerfectRush),
      button(t("Home"), home),
    ];
    const rewards = !isReplay ? rewardButton(() => perfectRushResults()) : null;
    if (rewards) actions.push(rewards);
    const isNewBest = !isReplay && newBest && (!prevBest || newBest.identityId === runContext?.identity.id);
    showPanel(
      `${isReplay ? t("Replay complete") : "Perfect Rush"} · ${result.perfectCount} Perfect`,
      `60s · ${result.rating}${isNewBest ? ` · ${wt("New Personal Best!", "Kỷ lục cá nhân mới!")}` : ""}`,
      actions,
    );
    panel.dataset.perfectRushScreen = "result";
    showStats([
      [t("Perfect"), String(result.perfectCount)],
      [t("Population"), String(result.population)],
      [t("Floors"), String(result.height)],
      [t("Accuracy"), `${result.accuracy.toFixed(1)}%`],
      [t("Duration"), `${(result.durationTicks / 60).toFixed(1)}s`],
      [wt("Best Perfects", "Hoàn hảo cao nhất"), newBest ? String(newBest.perfectCount) : String(result.perfectCount)],
    ]);
    paint();
  }
  function openSkylineSprint(): void {
    if (liveOpsManifest.killSwitch.sprintDisabled) {
      message(wt("Skyline Sprint is temporarily paused for maintenance.", "Skyline Sprint đang tạm dừng bảo trì."));
      home();
      return;
    }
    startGeneration++;
    checkpointCity(); abandonQuick(); cancelFrame(); run = null; replay = null; replayScrubPaused = false; runContext = null; cityActive = false; mapView = false;
    rankedId = null; userPaused = false; celebrating = false; renderer.resetEffects(); renderer.setGhost(null); paint();
    const def = resolveSkylineSprint();
    const spState = save.liveOps?.skylineSprint;
    const best = spState?.bestComplete ?? null;
    const ghostResolution = resolvePersonalGhost(save, { mode: "skyline-sprint", assist: false, seed: best?.seed ?? 0, building: "residential", skylineSprint: def });
    const actions: HTMLButtonElement[] = [];
    const playBtn = button(wt("Play", "Chơi"), () => { void startSkylineSprint(); });
    playBtn.dataset.skylineSprintStart = "true";
    actions.push(playBtn);
    if (best) {
      const replayEntry = save.replays.find(r => r.id === best.identityId);
      if (replayEntry) {
        const watchBtn = button(t("Replay"), () => { void startReplay(replayEntry.record); });
        watchBtn.dataset.skylineSprintReplay = "true";
        actions.push(watchBtn);
      }
    }
    const ghostBtn = button(`Ghost: ${ghostEnabled ? wt("On", "Bật") : wt("Off", "Tắt")}`, () => {
      ghostEnabled = !ghostEnabled;
      openSkylineSprint();
    });
    ghostBtn.dataset.ghostToggle = "true";
    ghostBtn.setAttribute("aria-pressed", String(ghostEnabled));
    const guideBtn = button(wt("Rules", "Luật"), skylineSprintGuide);
    guideBtn.dataset.skylineSprintGuide = "true";
    actions.push(ghostBtn, guideBtn, button(t("Home"), home));
    showPanel(
      "Skyline Sprint · 20F",
      wt("20 Residential body floors · No roof · 3 lives · +5s penalty per Miss.", "20 tầng thân Nhà ở · Không mái · 3 mạng · Phạt +5 giây mỗi lần trượt."),
      actions,
    );
    skylineSprintMenuOpen = true;
    panel.dataset.skylineSprintScreen = "entry";
    showStats([
      [wt("Best time", "Thời gian tốt nhất"), best ? `${(best.sprintScoreTicks / 60).toFixed(2)}s` : "—"],
      [wt("Raw time", "Thời gian gốc"), best ? `${(best.durationTicks / 60).toFixed(2)}s (+${best.misses * 5}s)` : "—"],
      [wt("Completed", "Hoàn thành"), String(spState?.completedRuns ?? 0)],
      [wt("Best failed", "Chưa xong cao nhất"), `${spState?.bestFailedHeight ?? 0}/20`],
      [wt("Attempts", "Số lượt"), String(spState?.attempts ?? 0)],
      ["Ghost", ghostResolution.status === "available" ? wt("Ready", "Sẵn sàng") : "—"],
    ]);
  }
  function skylineSprintGuide(): void {
    showPanel(
      wt("Skyline Sprint · Rules", "Skyline Sprint · Luật chơi"),
      wt(
        "• Land 20 Residential body floors (no roof, 3 lives).\n• Sprint Time = duration + 5s per Miss.\n• Only 20/20 completed runs record a time PB.\n• Earns body XP + finite completion bonus on 20/20.\n• Separate PB; never overwrites Quick Tower.",
        "• Đặt 20 tầng thân Nhà ở (không mái, 3 mạng).\n• Thời gian Sprint = thời lượng + 5 giây mỗi lần trượt.\n• Chỉ lượt đạt 20/20 mới ghi kỷ lục thời gian.\n• Nhận XP tầng thân + thưởng hoàn thành khi đạt 20/20.\n• Kỷ lục riêng; không ghi đè Quick Tower.",
      ),
      [button(t("Back"), openSkylineSprint)],
    );
    skylineSprintMenuOpen = true;
    panel.dataset.skylineSprintScreen = "guide";
  }
  async function startSkylineSprint(customSeed?: number): Promise<void> {
    if (liveOpsManifest.killSwitch.sprintDisabled) return;
    const def = resolveSkylineSprint();
    const generation = ++startGeneration;
    checkpointCity(); abandonQuick(); cancelFrame(); run = null; replay = null; replayScrubPaused = false; cityActive = false; mapView = false;
    rankedId = null;
    renderer.resetEffects(); renderer.setGhost(null); celebrating = false;
    showLoading(t("Preparing tower"));
    const equipment = equipmentFor(save, def.classId);
    await loadRunArtwork(def.classId, equipment);
    if (disposed || generation !== startGeneration) return;
    const seed = customSeed ?? options.seed();
    run = new QuickTowerGame({ mode: "skyline-sprint", assist: false, seed, building: def.classId, skylineSprint: def });
    applyGhost(run.config);
    const allocated = allocateRun(save, now());
    save = allocated.save;
    runContext = { ...allocated.context, equipment };
    finishedRecord = null;
    save = { ...save, tracking: { ...save.tracking, activeQuick: { ...runContext, progress: makeSummary(run, runContext, now(), "abandoned") } } };
    persist();
    lastFeedback = 0; userPaused = false;
    panel.hidden = true; pauseButton.textContent = t("Pause"); arena.focus(); paint(); syncPause(); schedule();
  }
  function skylineSprintResults(isReplay = false): void {
    const record = isReplay ? replay!.record : run!.getRecord();
    const result = record.result;
    const prevBest = save.liveOps?.skylineSprint?.bestComplete ?? null;
    if (!isReplay) settleCurrent();
    const newBest = save.liveOps?.skylineSprint?.bestComplete ?? null;
    const completed = result.height >= 20;
    const sprintTicks = result.sprintScoreTicks ?? result.durationTicks + result.misses * 300;
    const retryBtn = button(wt("Retry Sprint", "Thử lại Sprint"), () => { void startSkylineSprint(); });
    retryBtn.dataset.skylineSprintRetry = "true";
    const actions: HTMLButtonElement[] = [
      retryBtn,
      button(t("Replay / restart"), () => { void startReplay(record); }),
      button("Skyline Sprint", openSkylineSprint),
      button(t("Home"), home),
    ];
    const rewards = !isReplay ? rewardButton(() => skylineSprintResults()) : null;
    if (rewards) actions.push(rewards);
    const isNewBest = !isReplay && completed && newBest && (!prevBest || newBest.identityId === runContext?.identity.id);
    showPanel(
      completed
        ? `${isReplay ? t("Replay complete") : "Skyline Sprint"} · ${(sprintTicks / 60).toFixed(2)}s`
        : `${wt("Sprint Incomplete", "Sprint chưa hoàn thành")} (${result.height}/20)`,
      completed
        ? `20/20 · ${result.rating}${isNewBest ? ` · ${wt("New Personal Best!", "Kỷ lục cá nhân mới!")}` : ""}`
        : wt("Reach 20/20 floors to record a Sprint time PB.", "Đạt 20/20 tầng để ghi kỷ lục thời gian Sprint."),
      actions,
    );
    panel.dataset.skylineSprintScreen = "result";
    showStats([
      [wt("Sprint time", "Thời gian Sprint"), completed ? `${(sprintTicks / 60).toFixed(2)}s` : `${wt("Failed", "Trượt")} (${result.height}/20)`],
      [wt("Raw time", "Thời gian gốc"), `${(result.durationTicks / 60).toFixed(2)}s`],
      [wt("Miss penalty", "Phạt trượt"), `+${result.misses * 5}s (${result.misses})`],
      [t("Accuracy"), `${result.accuracy.toFixed(1)}%`],
      [wt("Best time", "Thời gian tốt nhất"), newBest ? `${(newBest.sprintScoreTicks / 60).toFixed(2)}s` : "—"],
      [t("Population"), String(result.population)],
    ]);
    paint();
  }
  function openOneDrop(): void {
    startGeneration++;
    checkpointCity(); abandonQuick(); cancelFrame(); run = null; replay = null; replayScrubPaused = false; runContext = null; cityActive = false; mapView = false;
    rankedId = null; userPaused = false; celebrating = false; renderer.resetEffects(); renderer.setGhost(null); paint();
    const dateUTC = utcDate(now());
    const def = resolveOneDrop(dateUTC);
    const dayEntry = save.oneDrop.days.find(d => d.dateUTC === dateUTC);
    const best = dayEntry?.best ?? null;
    const ghostResolution = resolvePersonalGhost(save, { mode: "one-drop", assist: false, seed: def.seed, building: def.classId, oneDrop: def });
    const quickGhostResolution = resolvePersonalGhost(save, { mode: "quick", assist: false, seed: 0, building: "residential" });
    const actions: HTMLButtonElement[] = [];
    const playBtn = button(wt("Play", "Chơi"), () => { void startOneDrop(dateUTC); });
    playBtn.dataset.oneDropStart = "true";
    actions.push(playBtn);
    if (best) {
      const replayEntry = save.replays.find(r => r.id === best.identityId);
      if (replayEntry) {
        const watchBtn = button(t("Replay"), () => { void startReplay(replayEntry.record); });
        watchBtn.dataset.oneDropReplay = "true";
        actions.push(watchBtn);
      }
    }
    const ghostBtn = button(
      `Ghost: ${ghostEnabled ? wt("On", "Bật") : wt("Off", "Tắt")}`,
      () => {
        ghostEnabled = !ghostEnabled;
        openOneDrop();
      },
    );
    ghostBtn.dataset.ghostToggle = "true";
    ghostBtn.setAttribute("aria-pressed", String(ghostEnabled));
    actions.push(ghostBtn);
    if (quickGhostResolution.status === "unavailable" && quickGhostResolution.retrySameSeedConfig) {
      const retrySeedConfig = quickGhostResolution.retrySameSeedConfig;
      const retryQuickGhostBtn = button(
        wt("PB Seed", "Seed PB"),
        () => { void start(false, false, retrySeedConfig); },
      );
      retryQuickGhostBtn.dataset.ghostRetryQuickSeed = "true";
      actions.push(retryQuickGhostBtn);
    }
    const guideBtn = button(wt("Rules", "Luật"), oneDropGuide);
    guideBtn.dataset.oneDropGuide = "true";
    actions.push(guideBtn, button(t("Home"), home));
    showPanel(
      `One Drop · ${dateUTC} UTC`,
      wt("4 Residential floors · 1 drop · 1 life.", "4 tầng Nhà ở dựng sẵn · 1 thả · 1 mạng."),
      actions,
    );
    oneDropMenuOpen = true;
    panel.dataset.oneDropScreen = "entry";
    showStats([
      [wt("Best error", "Độ lệch tốt nhất"), best ? `${(best.absError * 100).toFixed(1)}%` : "—"],
      [wt("Signed error", "Độ lệch dấu"), best ? `${best.signedError > 0 ? "+" : ""}${(best.signedError * 100).toFixed(1)}%` : "—"],
      [wt("Best quality", "Chất lượng tốt nhất"), best ? best.quality.toUpperCase() : "—"],
      [wt("Best time", "Thời gian tốt nhất"), best ? `${(best.durationTicks / 60).toFixed(2)}s` : "—"],
      [wt("Attempts", "Số lượt"), String(dayEntry?.attempts ?? 0)],
      ["Ghost", ghostResolution.status === "available" ? wt("Ready", "Sẵn sàng") : "—"],
    ]);
  }
  function oneDropGuide(): void {
    showPanel(
      wt("One Drop · Rules", "One Drop · Luật chơi"),
      wt(
        "• 4 swaying Residential floors prebuilt.\n• 1 scored drop, 1 life, no roof.\n• Lowest absError wins (faster ticks break ties).\n• Miss (≥100%) falls with lower collision.\n• 0 XP and 0 Quick PB impact.",
        "• 4 tầng Nhà ở dựng sẵn đang lắc.\n• 1 lần thả tính điểm, 1 mạng, không mái.\n• Độ lệch nhỏ nhất thắng (nhanh hơn phá hoà).\n• Trượt (≥100%) rơi và va vào thân dưới.\n• Không cộng XP hay kỷ lục Quick.",
      ),
      [button(t("Back"), openOneDrop)],
    );
    oneDropMenuOpen = true;
    panel.dataset.oneDropScreen = "guide";
  }
  async function startOneDrop(dateUTC = utcDate(now())): Promise<void> {
    const def = resolveOneDrop(dateUTC);
    const generation = ++startGeneration;
    checkpointCity(); abandonQuick(); cancelFrame(); run = null; replay = null; replayScrubPaused = false; cityActive = false; mapView = false;
    rankedId = null;
    renderer.resetEffects(); renderer.setGhost(null); celebrating = false;
    showLoading(t("Preparing tower"));
    const equipment = equipmentFor(save, def.classId);
    await loadRunArtwork(def.classId, equipment);
    if (disposed || generation !== startGeneration) return;
    run = new QuickTowerGame({ mode: "one-drop", assist: false, seed: def.seed, building: def.classId, oneDrop: def });
    applyGhost(run.config);
    const allocated = allocateRun(save, now());
    save = allocated.save;
    runContext = { ...allocated.context, equipment };
    finishedRecord = null;
    persist();
    lastFeedback = 0;
    userPaused = false;
    panel.hidden = true;
    pauseButton.textContent = t("Pause");
    arena.focus();
    paint();
    syncPause();
    schedule();
  }
  function oneDropResults(isReplay = false): void {
    const record = isReplay ? replay!.record : run!.getRecord();
    const def = record.config.oneDrop ?? resolveOneDrop(utcDate(now()));
    const prevBest = save.oneDrop.days.find(d => d.dateUTC === def.dateUTC)?.best ?? null;
    if (!isReplay) {
      settleCurrent();
    }
    const game = isReplay ? restoreTower({ version: record.physicsVersion, config: record.config, tick: record.endTick, inputs: record.inputs }) : run!;
    const context = runContext ?? { identity: { id: "replay:1", installationId: "replay", sequence: 1 }, startedAt: 0 };
    const summary = makeSummary(game, context, now());
    const odResult = extractOneDropResult(summary);
    const newBest = save.oneDrop.days.find(d => d.dateUTC === def.dateUTC)?.best ?? null;
    const retryBtn = button(wt("Retry One Drop", "Thử lại One Drop"), () => { void startOneDrop(def.dateUTC); });
    retryBtn.dataset.oneDropRetry = "true";
    const actions: HTMLButtonElement[] = [
      retryBtn,
      button(t("Replay / restart"), () => { void startReplay(record); }),
      button("One Drop", openOneDrop),
      button(t("Home"), home),
    ];
    const outcomeText = odResult.quality.toUpperCase();
    const isNewBest = !isReplay && newBest && (!prevBest || newBest.identityId === summary.identity.id);
    showPanel(
      `${isReplay ? t("Replay complete") : "One Drop"} · ${outcomeText}`,
      `${def.dateUTC} UTC${isNewBest ? ` · ${wt("New Personal Best!", "Kỷ lục cá nhân mới!")}` : ""}`,
      actions,
    );
    panel.dataset.oneDropScreen = "result";
    showStats([
      [wt("Placement error", "Độ lệch đặt khối"), `${(odResult.absError * 100).toFixed(1)}%`],
      [wt("Signed error", "Độ lệch dấu"), `${odResult.signedError > 0 ? "+" : ""}${(odResult.signedError * 100).toFixed(1)}%`],
      [wt("Outcome", "Kết quả"), outcomeText],
      [t("Duration"), `${(odResult.durationTicks / 60).toFixed(2)}s`],
      [wt("Best error", "Độ lệch tốt nhất"), newBest ? `${(newBest.absError * 100).toFixed(1)}%` : "—"],
      [t("Population"), String(odResult.population)],
    ]);
    paint();
  }
  function showOnlineError(): void {
    loadingDaily=false;
    if(disposed)return;
    showPanel(wt("Online run not started","Chưa bắt đầu lượt online"),wt("Check Ranked for sign-in, verification, storage or connection status. You can still choose personal play.","Mở Xếp hạng để xem đăng nhập, xác minh, bộ nhớ hoặc kết nối. Bạn vẫn có thể chọn chơi cá nhân."),[button(wt("Personal play","Chơi cá nhân"),home)]);
  }
  async function startOnline(mode:"quick"|"daily"):Promise<void> {
    if(!options.ranked||rankedStarting||!storageWritable)return;
    if(mode==="daily"&&featureFlags.daily===false&&!save.daily.pending){
      message(wt("Daily Tower is temporarily paused for maintenance. Existing progress is kept.","Daily Tower đang tạm dừng bảo trì. Tiến trình hiện có vẫn được giữ nguyên."));
      return;
    }
    if(mode==="daily"&&save.daily.pending){
      showPanel(t("Replace pending Daily?"),wt("Resume keeps the original run and its online eligibility.","Tiếp tục giữ lượt cũ và trạng thái online ban đầu."),[
        button(t("Resume Daily"),()=>{void resumeDaily();}),
        ...(featureFlags.daily !== false ? [button(t("Discard and play today"),()=>{discardDaily();void startOnline("daily");})] : []),
        button(t("Keep pending Daily"),openDaily)]);return;
    }
    rankedStarting=true;
    try{if(mode==="quick")await start(false,true);else await startDaily(undefined,true);}
    catch{showOnlineError();}finally{rankedStarting=false;loadingDaily=false;}
  }
  function confirmRecovery(): void {
    showPanel(t("Recover saved progress"), t("Retry reading your saved progress. Continuing will replace this unsaved session only after the saved data is read successfully."), [
      button(t("Retry load"), () => { void recoverSave(); }), button(t("Back"), home),
    ]);
  }
  function applySettings(): void {
    muted = options.showSoundControl === false ? false : save.settings.muted; reducedMotion = save.settings.reducedMotion ?? motionQuery.matches;
    if (muted) options.audio.suspend();
    updateSoundButtonUi();
    updatePauseButtonUi();
    if (options.showLanguageSwitch !== false && save.settings.locale) setLocale(save.settings.locale);
    save = { ...save, settings: { ...save.settings, locale: vi ? "vi" : "en" } };
  }
  function loadedSave(value: GameSave): void {
    save = initializeTracking(value, installationId(), now());
    if (save.tracking.activeQuick?.progress) save = settleRun(save, save.tracking.activeQuick.progress);
    ensurePendingContext();
    save = ensureWeeklyContracts(ensureMissions(save, now()), now(), liveOpsManifest);
    save = grantCosmetics(save,now());
    void options.ranked?.recover(save).catch(()=>{});
  }
  async function recoverSave(): Promise<void> {
    if (recovering || disposed) return;
    recovering = true;
    showPanel(t("Recover saved progress"), t("Reading saved progress…"), []);
    try {
      const value = await saveController.load();
      if (disposed) return;
      loadedSave(value); storageWritable = true;
      run = null; replay = null; runContext = null; cityActive = false; mapView = false;
      cancelFrame(); renderer.resetEffects(); applySettings(); home(); persist();
    } catch {
      if (!disposed) { storageWritable = false; home(); message(""); }
    } finally { recovering = false; }
  }
  function results(isReplay = false): void {
    options.audio.setCombo?.(0);
    const activeMode = isReplay ? replay?.record.config.mode : run?.config.mode;
    if (activeMode === "one-drop") { oneDropResults(isReplay); return; }
    if (activeMode === "perfect-rush") { perfectRushResults(isReplay); return; }
    if (activeMode === "skyline-sprint") { skylineSprintResults(isReplay); return; }
    if (activeMode === "daily") { dailyResults(isReplay); return; }
    if (cityActive && !isReplay) { cityResults(); return; }
    const result = isReplay ? replay!.getResult() : run!.getResult();
    const previousBest = result.ranked ? save.standardQuickBest : save.assistQuickBest;
    if (!isReplay) {
      const wasSettled = !!runContext && isSettled(save, runContext.identity);
      settleCurrent();
      if (!wasSettled && result.ranked && options.capabilities?.standardScore !== false) void options.score?.submitStandardQuick(result.population).catch(() => message(t("Score submission failed.")));
    }
    const record = isReplay ? replay!.record : finishedRecord;
    const ranked = !!rankedId && !isReplay;
    const primary = bigButton("rotate-ccw", ranked ? wt("Ranked again", "Chơi xếp hạng lại") : wt("Play again", "Chơi lại"), () => { void (ranked ? startOnline("quick") : start(!result.ranked)); });
    const secondary = [roundButton("home", t("Home"), home, "cb-round-lg")];
    if (record && record.endTick <= 432000 && record.inputs.length <= 4096) secondary.push(roundButton("eye", t("Replay / restart"), () => { void startReplay(record); }, "cb-round-lg"));
    secondary.push(roundButton("building-2", t("Build City"), cityMap, "cb-round-lg"));
    const note = node("p", "cb-result-note");
    note.textContent = isReplay ? t("Replay complete") : !result.ranked ? t("Assist · unranked") : ranked ? wt("Ranked · verifying online", "Xếp hạng · đang xác minh") : "";
    if (!isReplay && result.ranked && options.capabilities?.standardScore !== false && options.score?.getState) {
      scoreState = options.score.getState();
      const badge = node("span");
      badge.dataset.scoreStatus = scoreState.status;
      badge.textContent = scoreState.status === "idle" ? "" : ` · ${scoreBadgeText(scoreState)}`;
      note.append(badge);
    }
    showResultScreen(`${isReplay ? t("Replay complete") : t("Tower complete")} · ${result.rating}`, {
      rating: result.rating,
      value: formatNumber(result.population, vi),
      valueLabel: t("people"),
      ribbon: !isReplay && result.population > 0 && result.population > previousBest ? wt("New best", "Kỷ lục mới") : undefined,
      coins: isReplay ? undefined : runCoinsLabel(),
      coinsLabel: wt("Coins", "Xu"),
      stats: [
        { icon: "layers", value: String(result.height), label: t("Floors") },
        { icon: "star", value: String(result.perfectCount), label: t("Perfect") },
        { icon: "zap", value: String(result.bestStreak), label: wt("Combo", "Combo") },
      ],
    }, primary, [...secondary, isReplay ? null : rewardRoundButton(() => results()), saveRetryButton()], [note]);
    if (note.textContent) syncScoreUi(); else note.remove();
    paint();
  }
  function frame(time: number): void {
    raf = 0;
    if (disposed || hostPaused || userPaused || replayScrubPaused) return;
    const delta = lastTime > 0 ? Math.max(0, Math.min(.1, (time - lastTime) / 1000)) : 0; lastTime = time;
    renderer.updateEffects(delta);
    if (replay) replay.update(delta); else run?.update(delta);
    const s = current();
    if (!muted) options.audio.setCombo?.(s.phase === "ended" ? 0 : s.comboLevel);
    if (s.feedbackId !== lastFeedback) {
      lastFeedback = s.feedbackId;
      checkpointCity();
      if (!muted && s.lastPlacement) options.audio.play(s.lastPlacement);
    }
    if (run && !replay && pvpScreens.isInActiveMatch()) {
      pvpScreens.onLocalFrame(run);
    }
    paint(s);
    if (s.phase === "ended") {
      if (run && !replay && pvpScreens.isInActiveMatch()) {
        settleCurrent();
        pvpScreens.onLocalEnded(run);
        return;
      }
      celebrating = !!s.targetFloors && !run?.config.oneDrop && !replay?.record.config.oneDrop && !run?.config.skylineSprint && !replay?.record.config.skylineSprint && renderer.hasPopulationEffect();
      if (celebrating) schedule(); else results(!!replay);
    } else schedule();
  }
  function showPauseScreen(): void {
    screen(t("Paused"), "cb-pause-panel");
    const wrap = node("div", "cb-pause");
    wrap.append(node("strong", "cb-pause-title", t("Paused")));
    if (!hostPaused) {
      const row = node("div", "cb-pause-row");
      const canRestart = !!replay || (!!run && !rankedId && !cityActive && run.config.mode === "quick" && !pvpScreens.isInActiveMatch());
      if (canRestart) row.append(roundButton("rotate-ccw", replay ? t("Restart replay") : wt("Restart", "Chơi lại"), () => { if (replay) void startReplay(replay.record); else void start(run!.config.assist); }, "cb-round-lg"));
      const resume = node("button", "cb-play-big cb-play-mid");
      resume.type = "button"; resume.innerHTML = lucideSvg("play", 48);
      resume.setAttribute("aria-label", t("Resume")); resume.title = t("Resume");
      resume.addEventListener("click", () => { userPaused = false; syncPause(); });
      row.append(resume, roundButton(cityActive ? "building-2" : "home", cityActive ? t("City map") : t("Home"), cityActive ? cityMap : home, "cb-round-lg"));
      wrap.append(row);
      if (options.showSoundControl !== false) {
        const sound = roundButton(muted ? "volume-x" : "volume-2", soundLabel(), toggleSound, "cb-round-ghost");
        sound.dataset.sound = "true"; sound.setAttribute("aria-pressed", String(!muted));
        wrap.append(sound);
      }
    }
    panel.append(wrap);
    wrap.querySelector<HTMLElement>(".cb-play-big")?.focus({ preventScroll: true });
  }
  function syncPause(): void {
    const paused = userPaused || hostPaused;
    run?.setPaused(paused); replay?.setPaused(paused || replayScrubPaused);
    if (paused) {
      checkpointCity();
      cancelFrame(); options.audio.suspend();
      if ((run || replay) && (current().phase !== "ended" || celebrating)) showPauseScreen();
    } else {
      if ((run || replay) && (current().phase !== "ended" || celebrating)) { panel.hidden = true; arena.focus(); syncReplayControls(); }
      lastTime = 0; schedule();
    }
    updatePauseButtonUi();
  }
  function drop(): void {
    if (!ready || panel.hidden === false || hostPaused || userPaused || replay) return;
    if (run?.drop(run.getInterpolationAlpha())) checkpointCity();
  }
  function checkpointCity(): void {
    if (!ready || !run || replay) return;
    if (runContext && !isSettled(save, runContext.identity)) save = recordRunProgress(save, makeSummary(run, runContext, now(), run.getPhase() === "ended" ? "ended" : "abandoned"));
    if (run.config.mode === "daily" && save.daily.pending?.identity.id === runContext?.identity.id) {
      save = { ...save, daily: checkpointDaily(save.daily, run) };
      if (run.getPhase() === "ended") settleCurrent();
      persist();
    } else if (cityActive && save.city.pending) {
      save.city = updateCityCheckpoint(save.city, run);
      if (run.getPhase() === "ended") settleCurrent();
      persist();
    } else if (runContext && !isSettled(save, runContext.identity) && run.getPhase() !== "ended") {
      save = { ...save, tracking: { ...save.tracking, activeQuick: { ...runContext, progress: makeSummary(run, runContext, now(), "abandoned") } } }; persist();
    }
  }
  function openDaily(): void {
    if (featureFlags.daily === false && !save.daily.pending) {
      message(wt("Daily Tower is temporarily paused for maintenance. Existing progress is kept.","Daily Tower đang tạm dừng bảo trì. Tiến trình hiện có vẫn được giữ nguyên."));
      home();
      return;
    }
    startGeneration++;
    checkpointCity(); abandonQuick(); cancelFrame(); run = null; replay = null; runContext = null; cityActive = false; mapView = false;
    rankedId=null;
    userPaused = false; celebrating = false; renderer.resetEffects(); paint(); dailyScreens.entry();
    tutorialHint("daily",wt("20 floors, then one roof drop","20 tầng, rồi 1 lần thả mái"));
  }
  function discardDaily(): void {
    const pending = save.daily.pending;
    if (!pending) return;
    const game = run?.config.mode === "daily" && runContext?.identity.id === pending.identity.id ? run : restoreTower(pending.checkpoint);
    if(options.ranked){const port=options.ranked;if(game.getPhase()==="ended"){void port.resume(pending.identity.id,game.config).then(id=>id?port.complete(id,game.getRecord()):undefined).catch(()=>{});}else void port.abandon(pending.identity.id).catch(()=>{});}rankedId=null;
    save = settleRun(save, makeSummary(game, pending, now(), game.getPhase() === "ended" ? "ended" : "abandoned"), game.getPhase() === "ended" ? game.getRecord() : undefined);
    save = { ...save, daily: { ...save.daily, pending: null } };
    cancelFrame(); run = null; replay = null; runContext = null; persist();
  }
  async function startDaily(dateUTC = utcDate(now()), ranked = false): Promise<void> {
    if(options.presentation === "content" && options.onNavigate){options.onNavigate("daily");return;}
    if (featureFlags.daily === false) {
      message(wt("Daily Tower is temporarily paused for maintenance. Existing progress is kept.","Daily Tower đang tạm dừng bảo trì. Tiến trình hiện có vẫn được giữ nguyên."));
      return;
    }
    if (loadingDaily || save.daily.pending) return;
    const definition = resolveDaily(dateUTC);
    const generation=++startGeneration;
    checkpointCity(); abandonQuick(); cancelFrame(); run = null; replay = null; cityActive = false; mapView = false; loadingDaily = true;
    renderer.resetEffects(); celebrating = false; showLoading(t("Preparing tower"));
    const equipment=equipmentFor(save,definition.classId);await loadRunArtwork(definition.classId,equipment);
    if(disposed||generation!==startGeneration){loadingDaily=false;return;}
    const ticket=ranked ? await options.ranked!.start("daily") : null;
    loadingDaily = false; if (disposed || save.daily.pending || generation!==startGeneration) return;
    rankedId=ticket?.id ?? null;
    run = new QuickTowerGame(ticket?.config ?? { mode: "daily", assist: false, seed: definition.seed, building: definition.classId, daily: definition });
    applyGhost(run.config);
    const previousSave=save;
    const allocated = allocateRun(save, now()); save = allocated.save; runContext = { ...allocated.context,equipment };
    try{if(ticket)await options.ranked!.bind(ticket.id,runContext.identity.id);}catch(error){save=previousSave;run=null;runContext=null;rankedId=null;throw error;}
    if(disposed||generation!==startGeneration)return;
    save = { ...save, daily: beginDaily(save.daily, run, runContext) }; finishedRecord = null; persist();
    if(ticket){flushSave();await saveController.flush();if(rewardSaveStatus==="error"){void options.ranked!.abandon(runContext.identity.id).catch(()=>{});save=previousSave;run=null;runContext=null;rankedId=null;throw new Error("storage");}}
    if(disposed||generation!==startGeneration)return;
    lastFeedback = 0; userPaused = false; panel.hidden = true; updatePauseButtonUi(); arena.focus(); paint(); syncPause(); schedule();
  }
  async function resumeDaily(): Promise<void> {
    const generation=++startGeneration;
    if(options.presentation === "content" && options.onNavigate){options.onNavigate("daily");return;}
    const pending = save.daily.pending; if (!pending || loadingDaily) return;
    checkpointCity(); abandonQuick(); cancelFrame(); run = null; replay = null; cityActive = false; mapView = false; loadingDaily = true;
    showLoading(t("Preparing tower"));
    await loadRunArtwork(pending.checkpoint.config.building!,pending.equipment??{...DEFAULT_EQUIPMENT});
    loadingDaily = false; if (disposed || generation!==startGeneration || save.daily.pending?.identity.id !== pending.identity.id) return;
    try{rankedId=await options.ranked?.resume(pending.identity.id,pending.checkpoint.config) ?? null;}catch{showOnlineError();return;}
    if(disposed||generation!==startGeneration)return;
    run = restoreTower(pending.checkpoint); runContext = pending; renderer.resetEffects(run.getSnapshot().feedbackId); applyGhost(run.config); celebrating = false;
    userPaused = false; lastFeedback = run.getSnapshot().feedbackId; panel.hidden = true; updatePauseButtonUi(); paint();
    if (run.getPhase() === "ended") dailyResults(); else { syncPause(); schedule(); arena.focus(); }
  }
  function dailyResults(isReplay = false): void {
    if (!isReplay) checkpointCity();
    const record = isReplay ? replay!.record : run!.getRecord();
    const game = isReplay ? restoreTower({ version: record.physicsVersion, config: record.config, tick: record.endTick, inputs: record.inputs }) : run!;
    const context = runContext ?? { identity: { id: "replay:1", installationId: "replay", sequence: 1 }, startedAt: 0 };
    const summary = makeSummary(game, context, now());
    const previousBest = isReplay ? save.daily.days.find(d => d.dateUTC === record.config.daily!.dateUTC)?.bestComplete?.result.population ?? 0 : save.daily.pending?.previousBest ?? 0;
    dailyScreens.result(summary, previousBest, record, isReplay);
    if(rankedId&&!isReplay){panel.querySelector(".cb-result-card")?.append(node("p","cb-result-note",wt("Ranked · verifying online","Xếp hạng · đang xác minh")));panel.querySelector(".cb-result-row")?.append(roundButton("crown",wt("Ranked Daily again","Chơi Daily xếp hạng lại"),()=>{void startOnline("daily");},"cb-round-lg"));}
    const rewards = !isReplay ? rewardRoundButton(() => dailyResults()) : null; if (rewards) panel.querySelector(".cb-result-row")?.append(rewards);
    const retry = !isReplay ? saveRetryButton() : null; if (retry) panel.querySelector(".cb-result-row")?.append(retry);
    paint();
  }
  function className(id: BuildingId): string {
    return ({ residential: t("Residential"), industrial: t("Industrial"), office: t("Office"), highrise: t("High-rise") })[id];
  }
  let guideBack: () => void = home;
  function showGuide(page:number, back:()=>void): void {
    guidePage=page;guideBack=back;
    const guide=cityGuide(vi), actions:HTMLButtonElement[]=[];
    if(page>0)actions.push(button(t("Previous"),()=>showGuide(page-1,back)));
    if(page<guide.pages.length-1)actions.push(button(t("Next"),()=>showGuide(page+1,back)));
    actions.push(button(t("Back"),()=>{guidePage=-1;back();}));
    showPanel(`${guide.title} · ${page+1}/${guide.pages.length}`,guide.pages[page],actions);
    panel.classList.add("cb-guide-panel");
    const content=document.createElement("section"),heading=document.createElement("h3"),list=document.createElement("ul");
    content.className="cb-guide-content";heading.textContent=guide.sections[page].heading;
    for(const item of guide.sections[page].items) { const li=document.createElement("li");li.textContent=item;list.append(li); }
    content.append(heading,list);panel.querySelector("p")!.replaceWith(content);
  }
  function cityArt(classId: BuildingId, skin?: string): HTMLImageElement {
    const set = skin ? renderCosmetic(skin, "building", classId).set : "default";
    const image = node("img", "cb-building-art");
    image.src = `${options.assets}/city/${set}/city_${classId}_${set}_mini.png`;
    image.alt = ""; image.draggable = false;
    let defaultTried = set === "default";
    image.addEventListener("error", () => {
      if (!defaultTried) { defaultTried = true; image.src = `${options.assets}/city/default/city_${classId}_default_mini.png`; }
      else image.remove();
    });
    return image;
  }
  function cityMap(): void {
    startGeneration++;
    mapView=true;
    checkpointCity(); abandonQuick(); cancelFrame(); run = null; replay = null; cityActive = false; userPaused = false; paint();
    rankedId=null;
    if (save.districts.evolution.notifiedStage !== save.districts.evolution.highestStage) {
      const stageDef = CITY_EVOLUTION_STAGES.find(st => st.id === save.districts.evolution.highestStage);
      if (stageDef) {
        message(wt(`New highest city stage reached: ${stageDef.title.en}!`, `Đạt cấp đô thị cao nhất mới: ${stageDef.title.vi}!`));
      }
      save = acknowledgeEvolutionStage(save);
      persist();
    }
    const activeDistrict = save.districts.activeDistrict;
    const districtState = activeDistrict === "harbor" ? save.districts.harbor : save.districts.downtown;
    const city = save.city;
    const status = districtPlacementStatus(save, activeDistrict, selectedLot, selectedClass);
    const old = districtState.lots[selectedLot];
    const totalPop = totalCityPopulation(save);
    const currentStageDef = deriveEvolutionStage(totalPop);
    const highestStageDef = CITY_EVOLUTION_STAGES.find(st => st.id === save.districts.evolution.highestStage) ?? currentStageDef;
    const goal = districtGoalProgress(save, activeDistrict);
    screen(activeDistrict === "harbor" ? wt("Build City · Harbor", "Xây thành phố · Bến cảng") : t("Build City · Downtown"), "cb-city-panel");
    tutorialHint("city",wt("Pick a lot, pick a building, build.","Chọn ô, chọn loại nhà, rồi xây."));
    const wrap = node("div", "cb-city");

    const top = node("div", "cb-city-top");
    const population = pill("users", formatNumber(totalPop, vi), t("city population"), "cb-city-pop");
    population.dataset.evolutionStage = currentStageDef.id;
    population.title = `${currentStageDef.title[vi ? "vi" : "en"]} · ${goal.completedTowers.current}/${goal.completedTowers.target}${goal.completedPreviously ? " ✓" : ""}`;
    const districtsBtn = roundButton("map", wt("Districts", "Quận"), () => districtScreens.open(activeDistrict === "harbor" ? 1 : 0));
    districtsBtn.dataset.districtsOpen = "true";
    top.append(roundButton("chevron-left", t("Home"), home), population, districtsBtn);

    // Each lot shows the building artwork with its floor count as a corner badge.
    const grid = node("div", "cb-city-grid"); grid.setAttribute("role", "group");
    grid.setAttribute("aria-label", activeDistrict === "harbor" ? wt("Harbor 5 by 5 lots", "Bến cảng: 5 hàng, 5 cột ô đất") : t("Downtown 5 by 5 lots"));
    grid.dataset.district = activeDistrict;
    grid.dataset.evolutionStage = currentStageDef.id;
    grid.dataset.highestStage = highestStageDef.id;
    if (activeDistrict === "harbor") {
      grid.style.backgroundColor = "#c8d6df";
      if (!harborBgFailed) grid.style.backgroundImage = `url('${options.assets}/bg/harbor/bg_harbor_default_map.png')`;
    } else {
      grid.style.backgroundColor = "#8fcf8f";
      grid.style.backgroundImage = `url('${options.assets}/bg/default/bg_downtown_default_map.png')`;
    }
    for (let index = 0; index < 25; index++) {
      const lot = districtState.lots[index], lotStatus = districtPlacementStatus(save, activeDistrict, index, selectedClass), valid = lotStatus.valid;
      const b = node("button", "cb-lot"); b.type = "button";
      b.addEventListener("click", () => { selectedLot = index; cityMap(); });
      b.dataset.lot = String(index); b.dataset.valid = String(valid); b.setAttribute("aria-pressed", String(index === selectedLot));
      b.title = `(${Math.floor(index / 5) + 1},${index % 5 + 1}) · ${lotStatus.locked ? t("Locked: complete and accept the previous tier.") : lotStatus.missing.length ? `${t("Needs edge-adjacent")}: ${lotStatus.missing.map(className).join(" + ")}` : t("Click to select this valid lot")}`;
      b.setAttribute("aria-label", `${t("Lot")} ${index + 1}: ${lot ? `${className(lot.classId)}, ${lot.floors} ${t("floors")}, ${lot.population} ${t("people")}` : t("empty")}`);
      if (lot) {
        b.dataset.built = "true"; b.dataset.class = lot.classId;
        b.style.setProperty("--cb-class-color", BUILDINGS[lot.classId].color);
        const badge = node("span", "cb-lot-badge", String(lot.floors));
        if (lot.roof) badge.append(node("i", "cb-lot-roof"));
        b.append(cityArt(lot.classId, lot.skin), badge);
      } else if (valid && !city.pending) b.append(icon("plus", 22, "cb-lot-plus"));
      grid.append(b);
    }

    const detail = node("p", "cb-city-detail");
    detail.dataset.evolutionStage = currentStageDef.id;
    detail.dataset.highestStage = highestStageDef.id;
    detail.title = status.locked ? t("Locked: complete and accept the previous tier first.") : status.missing.length ? `${t("Needs adjacent")}: ${status.missing.map(className).join(" + ")}` : t("Valid placement. Only four-direction neighbors count.");
    if (city.pending) {
      detail.dataset.state = "pending";
      detail.append(icon("building-2", 18), node("span", "", wt("Tower in progress", "Đang xây dở")));
    } else if (status.locked) {
      detail.dataset.state = "locked";
      detail.append(icon("lock", 18), node("span", "", wt("Finish the previous tier", "Hoàn thành hạng trước")));
    } else if (status.missing.length) {
      detail.dataset.state = "missing";
      detail.append(icon("alert-triangle", 18), node("span", "", wt("Needs next to", "Cần kề")));
      for (const need of status.missing) {
        const chip = node("span", "cb-need-chip", String(BUILDINGS[need].floors));
        chip.style.setProperty("--cb-class-color", BUILDINGS[need].color); chip.title = className(need);
        detail.append(chip);
      }
    } else {
      detail.dataset.state = "valid";
      detail.append(icon("check", 18), node("span", "", old ? `${formatNumber(old.population, vi)} ${t("people")} → ${className(selectedClass)}` : className(selectedClass)));
    }
    if (!city.pending && !status.locked && !districtState.lots.some((lot, index) => !lot && districtPlacementStatus(save, activeDistrict, index, selectedClass).valid)) {
      detail.title += `\n${t("No valid empty lot. Add a supporting neighbor.")}`;
    }

    const sheet = node("div", "cb-city-sheet");
    const classes = node("div", "cb-city-classes");
    for (const id of BUILDING_IDS) {
      const unlocked = city.unlocked.includes(id);
      const card = node("button", "cb-class-card"); card.type = "button";
      card.dataset.class = id; card.dataset.locked = String(!unlocked);
      card.setAttribute("aria-pressed", String(id === selectedClass));
      card.setAttribute("aria-label", `${className(id)} · ${BUILDINGS[id].floors} ${t("floors")}${unlocked ? "" : ` · ${wt("Locked", "Đã khóa")}`}`);
      card.title = card.getAttribute("aria-label")!;
      card.style.setProperty("--cb-class-color", BUILDINGS[id].color);
      card.append(cityArt(id, equipmentFor(save, id).building), node("span", "cb-class-floors", String(BUILDINGS[id].floors)));
      if (!unlocked) card.append(icon("lock", 18, "cb-class-lock"));
      card.addEventListener("click", () => { selectedClass = id; cityMap(); });
      classes.append(card);
    }
    const actions = node("div", "cb-city-actions");
    let primary: HTMLButtonElement;
    if (city.pending) {
      primary = bigButton("play", t("Resume tower"), () => { void resumeCity(); });
      actions.append(primary, roundButton("x", t("Cancel pending tower"), () => {
        showPanel(t("Cancel construction?"), t("The old building, if any, will be kept. Pending progress will be discarded."), [button(t("Confirm cancel"), () => { discardPendingCity(); cityMap(); }), button(t("Back"), cityMap)]);
      }, "cb-round-lg"));
    } else {
      primary = bigButton("play", old ? wt("Rebuild", "Xây lại") : wt("Build", "Xây"), () => { void beginSelectedCity(); });
      primary.disabled = !status.valid || loadingCity;
      actions.append(primary);
      if (old) actions.append(roundButton("trash-2", t("Demolish"), () => {
        showPanel(t("Demolish building?"), `${t("Population change")}: -${old.population}.\n${t("Existing neighbors and unlocked classes stay intact.")}`, [button(t("Confirm demolition"), () => { save = demolishDistrictBuilding(save, activeDistrict, selectedLot, now()); persist(); cityMap(); }), button(t("Back"), cityMap)]);
      }, "cb-round-lg"));
    }
    actions.append(roundButton("help-circle", t("Guide"), () => showGuide(0, cityMap), "cb-round-lg"));
    const retry = saveRetryButton(); if (retry) actions.append(retry);
    sheet.append(classes, actions);

    const stage = node("div", "cb-city-stage");
    stage.append(grid);
    wrap.append(top, stage, detail, sheet);
    if (save.districts.landmarks.dock_clock_tower.placed) {
      const lmSlot = node("div", "cb-landmark-slot");
      lmSlot.dataset.landmarkSlot = "dock_clock_tower";
      lmSlot.title = DOCK_CLOCK_TOWER_LANDMARK.title[vi ? "vi" : "en"];
      const lmImg = node("img");
      lmImg.src = `${options.assets}/city/harbor/landmark_dock_clock_tower_mini.png`;
      lmImg.alt = DOCK_CLOCK_TOWER_LANDMARK.title[vi ? "vi" : "en"];
      lmImg.width = 20; lmImg.height = 30;
      lmImg.addEventListener("error", () => lmImg.remove());
      lmSlot.append(lmImg);
      grid.append(lmSlot);
    }
    panel.append(wrap);
    (primary.disabled ? grid.querySelector<HTMLElement>("[aria-pressed=\"true\"]") : primary)?.focus({ preventScroll: true });
    hint.textContent = t("Complete a tier to unlock the next. A roof is a separate drop.");
    el("[data-population]").textContent = String(totalPop);
    el("[data-floors]").textContent = String(districtState.lots.reduce((sum,lot)=>sum+(lot?.floors??0),0));
    el("[data-mode]").textContent = "";
  }
  async function beginSelectedCity(): Promise<void> {
    const activeDistrict = save.districts.activeDistrict;
    if (loadingCity || save.city.pending || !districtPlacementStatus(save, activeDistrict, selectedLot, selectedClass).valid) return;
    loadingCity = true;
    const lot = selectedLot, id = selectedClass;
    showLoading(t("Preparing construction"));
    const equipment=equipmentFor(save,id);await loadRunArtwork(id,equipment);
    loadingCity = false; if (disposed) return;
    save = beginDistrictTower(save, activeDistrict, lot, id, options.seed(), now(), equipment); persist();
    await resumeCity();
  }
  async function resumeCity(): Promise<void> {
    const pending = save.city.pending; if (!pending || loadingCity) return;
    loadingCity = true;
    await loadRunArtwork(pending.classId,pending.equipment??{...DEFAULT_EQUIPMENT});
    loadingCity = false; if (disposed || save.city.pending?.runId !== pending.runId) return;
    ensurePendingContext(); runContext = save.tracking.pendingCity;
    cancelFrame(); run = restoreTower(pending.checkpoint); replay = null; cityActive = true;
    renderer.resetEffects(run.getSnapshot().feedbackId); celebrating=false;
    userPaused = false; lastFeedback = run.getSnapshot().feedbackId; panel.hidden = true;
    updatePauseButtonUi(); paint();
    if (run.getPhase() === "ended") cityResults(); else { syncPause(); schedule(); arena.focus(); }
  }
  function cityResults(): void {
    checkpointCity();
    const pending = save.city.pending; if (!pending || !run) return;
    const targetDistrict = pending.districtId ?? "downtown";
    const targetLots = targetDistrict === "harbor" ? save.districts.harbor.lots : save.districts.downtown.lots;
    const result = run.getResult(), s = run.getSnapshot(), old = targetLots[pending.lot];
    const target = BUILDINGS[pending.classId].floors;
    const complete = result.height === target;
    const accept = () => {
      const wasHarborUnlocked = save.districts.unlockedDistricts.includes("harbor");
      save = acceptTrackedCity(save, pending.runId, now()); cityActive = false; runContext = null; persist();
      if (!wasHarborUnlocked && save.districts.unlockedDistricts.includes("harbor")) {
        showPanel(
          wt("Harbor District Unlocked!", "Đã mở khoá Quận Bến cảng!"),
          wt("Downtown goal completed! You can now build in the coastal 5×5 Harbor district and work toward the Dock Clock Tower landmark.", "Đã đạt mục tiêu Trung tâm! Bạn có thể xây dựng ở Quận Bến cảng 5×5 và chinh phục biểu tượng Tháp Đồng hồ Cảng."),
          [
            button(wt("Enter Harbor", "Vào Bến cảng"), () => { void switchDistrict("harbor"); }),
            button(wt("Stay in Downtown", "Ở lại Trung tâm"), cityMap),
          ],
        );
        return;
      }
      cityMap();
    };
    const primary = bigButton("check", result.height ? t("Accept building") : t("Return to city"), accept);
    const discard = roundButton("x", old ? t("Keep old building") : t("Discard tower"), () => { discardPendingCity(); cityMap(); }, "cb-round-lg");
    const art = node("div", "cb-result-art");
    art.style.setProperty("--cb-class-color", BUILDINGS[pending.classId].color);
    art.append(cityArt(pending.classId, pending.equipment?.building), node("span", "cb-class-floors", `${result.height}/${target}`));
    const note = node("p", "cb-result-note", `${className(pending.classId)} · ${s.roof ? t("Roof placed") : complete ? t("Body complete, roof missed") : t("Unfinished tower · no completion unlock")}`);
    if (old) note.textContent += ` · ${t("Old building stays until you accept")}: ${old.population}`;
    showResultScreen(`${t("City tower complete")} · ${result.rating}`, {
      rating: result.rating,
      value: formatNumber(result.population, vi),
      valueLabel: t("people"),
      coins: runCoinsLabel(),
      coinsLabel: wt("Coins", "Xu"),
      stats: [
        { icon: "layers", value: `${result.height}/${target}`, label: t("Floors") },
        { icon: "star", value: String(result.perfectCount), label: t("Perfect") },
        { icon: s.roof ? "check" : "x", value: s.roof ? "✓" : "—", label: t("Roof") },
      ],
    }, primary, [discard, rewardRoundButton(cityResults), saveRetryButton()], [art, note]);
    paint();
  }
  listen(arena, "pointerdown", ((event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || (event.target as HTMLElement).closest("button,select,input,a,.cb-panel,.cb-replay-controls,.cb-tutorial")) return;
    event.preventDefault(); arena.focus(); drop();
  }) as EventListener);
  listen(arena, "keydown", ((event: KeyboardEvent) => {
    if ((event.key !== " " && event.key !== "Enter") || event.repeat || (event.target as HTMLElement).closest("button,select,input,a,.cb-replay-controls,.cb-tutorial")) return;
    event.preventDefault(); drop();
  }) as EventListener);
  listen(pauseButton, "click", () => { userPaused = !userPaused; syncPause(); });
  function setLocale(locale:string): void {
    const next=locale.startsWith("vi");if(next===vi)return;
    const shownTutorial=!tutorial.hidden;
    const pairs=[...translations].map(([en,vn]):[string,string]=>vi?[vn,en]:[en,vn]).filter(([a,b])=>a!==b).sort((a,b)=>b[0].length-a[0].length);
    const lookup=new Map(pairs);
    const pattern=pairs.length?new RegExp(pairs.map(([from])=>from.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|"),"g"):null;
    const translate=(value:string)=>pattern?value.replace(pattern,match=>lookup.get(match)!):value;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node:Node|null;
    while((node=walker.nextNode()))if(node.nodeValue)node.nodeValue=translate(node.nodeValue);
    for(const element of root.querySelectorAll<HTMLElement>("[title],[aria-label]"))for(const attr of ["title","aria-label"]) {
      const value=element.getAttribute(attr);if(value)element.setAttribute(attr,translate(value));
    }
    vi=next;root.lang=vi?"vi":"en";renderer.setLocale(locale);
    save = { ...save, settings: { ...save.settings, locale: vi ? "vi" : "en" } };
    // Pause and Paused share a Vietnamese translation; restore controls from state, not reverse text.
    updatePauseButtonUi();
    updateSoundButtonUi();
    if(guidePage>=0)showGuide(guidePage,guideBack);else if(gameMenuOpen)openMenu();else if(oneDropMenuOpen){if(panel.dataset.oneDropScreen==="guide")oneDropGuide();else openOneDrop();}else if(perfectRushMenuOpen){if(panel.dataset.perfectRushScreen==="guide")perfectRushGuide();else openPerfectRush();}else if(skylineSprintMenuOpen){if(panel.dataset.skylineSprintScreen==="guide")skylineSprintGuide();else openSkylineSprint();}else if(pvpScreens.isOpen())pvpScreens.refresh();else if(districtScreens.isOpen())districtScreens.refresh();else if(bookScreens.isOpen())bookScreens.refresh();else if(progressionScreens.isOpen())progressionScreens.refresh();else if(dataScreens.isOpen())dataScreens.refresh();else if(dailyScreens.isOpen()) {
      if(rankedId&&run?.config.mode==="daily"&&run.getPhase()==="ended"&&!replay){dailyResults();return;}
      dailyScreens.refresh(); const rewards = run?.config.mode === "daily" && run.getPhase() === "ended" && !replay ? rewardRoundButton(() => dailyResults()) : null;
      if(rewards)panel.querySelector(".cb-result-row")?.append(rewards);
    }else if(run||replay){if(replay)buildReplayControls();paint();}else if(panel.classList.contains("cb-city-panel"))cityMap();else if(panel.classList.contains("cb-home-panel"))home();else if(panel.classList.contains("cb-pause-panel"))syncPause();
    if(shownTutorial && tutorialMode==="daily")tutorialHint("daily",wt("20 floors, then one roof drop","20 tầng, rồi 1 lần thả mái"));
    persist();
    syncScoreUi();
  }
  listen(window, "pagehide", () => { checkpointCity(); flushSave(); });
  if (options.lifecycle) {
    cleanups.push(options.lifecycle.onPause(() => { hostPaused = true; syncPause(); }), options.lifecycle.onResume(() => { hostPaused = false; syncPause(); }));
  } else listen(document, "visibilitychange", () => { hostPaused = document.hidden; syncPause(); });
  const observer = new ResizeObserver(() => { renderer.resize(arena.clientWidth, arena.clientHeight); paint(); });
  observer.observe(arena); cleanups.push(() => observer.disconnect());
  listen(panel,"keydown",((event:KeyboardEvent)=>{
    if(panel.getAttribute("aria-modal")!=="true"||event.key!=="Tab")return;
    const buttons=[...panel.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
    if(event.shiftKey&&index<=0){event.preventDefault();buttons[buttons.length-1]?.focus();}
    else if(!event.shiftKey&&index===buttons.length-1){event.preventDefault();buttons[0]?.focus();}
  }) as EventListener);
  function navigate(screen:SessionScreen,replayId?:string):void {
    startGeneration++;
    if(!ready||disposed)return;
    const show=()=>{
      if(screen==="city")cityMap();else if(screen==="daily")openDaily();else if(screen==="one-drop")openOneDrop();else if(screen==="perfect-rush")openPerfectRush();else if(screen==="skyline-sprint")openSkylineSprint();else if(screen==="pvp")openPvp(options.initialPvpRoom);
      else if(screen==="statistics"||screen==="history"){
        if(options.presentation==="content"){if(screen==="statistics")dataScreens.statistics();else dataScreens.history();}
        else openData(screen==="history");
        if(screen==="history"&&replayId)dataScreens.details(replayId);
      }else if(screen==="book")openBook();else if(screen==="progression")openProgression();else home();
    };
    const live=!!run&&!replay&&run.getPhase()!=="ended";
    const pending=save.city.pending&&screen!=="city"||save.daily.pending&&screen!=="daily";
    if(live||pending){
      const paused=userPaused;userPaused=true;cancelFrame();checkpointCity();
      showPanel(wt("Switch screen?","Chuyển màn hình?"),wt("City and Daily construction stays saved. Leaving a live Quick run ends that attempt.","City và Daily đang dở vẫn được lưu. Rời lượt Quick đang chơi sẽ kết thúc lượt đó."),[
        button(wt("Continue navigation","Tiếp tục chuyển"),show),
        button(wt("Stay here","Ở lại"),()=>{panel.removeAttribute("aria-modal");if(live){userPaused=paused;panel.hidden=true;paint();syncPause();schedule();arena.focus();}else if(save.city.pending)cityMap();else openDaily();})]);
      panel.setAttribute("aria-modal","true");
    }else show();
  }
  const readyPromise = (async () => {
    const load = renderer.load().catch(() => message(t("Some artwork could not load; playing with fallback graphics.")));
    let initialRaw = "";
    try {
      const value = await saveController.load();
      if (disposed) return;
      try { initialRaw = JSON.stringify(prepareSave(value)); } catch { initialRaw = ""; }
      loadedSave(value);
    }
    catch { storageWritable = false; message(""); }
    await load;
    if (disposed) return;
    applySettings();
    ready = true; renderer.resize(arena.clientWidth, arena.clientHeight);
    if(options.initialScreen)navigate(options.initialScreen,options.initialReplayId);else home();
    let currentRaw = "";
    try { currentRaw = JSON.stringify(prepareSave(save)); } catch { currentRaw = ""; }
    if (currentRaw !== initialRaw) persist();
  })();
  function setFeatureFlags(nextFlags: SessionFeatureFlags): void {
    featureFlags = { ...featureFlags, ...nextFlags };
    if (ready && !disposed && !run && !replay && !mapView && !dailyScreens.isOpen() && !progressionScreens.isOpen() && !bookScreens.isOpen() && !dataScreens.isOpen() && !pvpScreens.isOpen() && guidePage < 0) {
      home();
    }
  }
  function setLiveOpsManifest(manifest: LiveOpsManifest): void {
    liveOpsManifest = manifest;
    if (!ready || disposed) return;
    const before = JSON.stringify(save);
    save = ensureWeeklyContracts(save, now(), liveOpsManifest);
    if (JSON.stringify(save) !== before) persist();
    if (ready && !disposed) {
      if (progressionScreens.isOpen()) progressionScreens.refresh();
      else if (bookScreens.isOpen()) bookScreens.refresh();
      else if (!run && !replay && !mapView && !dailyScreens.isOpen() && !dataScreens.isOpen() && !pvpScreens.isOpen() && guidePage < 0) home();
    }
  }
  return { ready: readyPromise, setLocale, setFeatureFlags, setLiveOpsManifest, navigate, whenSaved: () => saveController.flush(), async checkpointAndPause() { userPaused=true;syncPause();const hadActiveRun=Boolean((cityActive&&run)||(run&&!replay&&runContext));checkpointCity();if(saveTimer||hadActiveRun)flushSave(); await saveController.flush(); return storageWritable && rewardSaveStatus !== "error"; }, dispose() {
    const hadActiveRun=Boolean((cityActive&&run)||(run&&!replay&&runContext));
    checkpointCity(); abandonQuick(); if(saveTimer||hadActiveRun)flushSave();
    progressionScreens.clear();
    bookScreens.clear();
    pvpScreens.dispose();
    disposed = true;startGeneration++; saveController.dispose(); cancelFrame(); abort.abort(); cleanups.forEach(fn => fn());
    renderer.dispose(); options.audio.dispose(); root.replaceChildren();
  } };
}
