import { SESSION_TEXT, type SessionTextKey } from "../../city-bloxx-content/session-locales";
import { allocateRun, beginCityTower, BUILDING_IDS, BUILDINGS, cancelCityTower, cityPopulation, demolishCityBuilding, emptySave, initializeTracking, isSettled, makeSummary, pinReplay, placementStatus, prepareSave, QuickTowerGame, QuickTowerReplay, restoreTower, settleRun, updateCityCheckpoint, type AudioPort, type BuildingId, type Capabilities, type GameSave, type LifecyclePort, type RunContext, type RunRecord, type SavePort, type ScorePort, type TrackingPort } from "../../city-bloxx-core/src/index";
import { QuickTowerRenderer } from "./index";
import { cityGuide } from "./city-guide";
import { createDataScreens } from "./data-screens";
import { createSaveController } from "./save-controller";
import { beginDaily, checkpointDaily, resolveDaily, utcDate } from "../../city-bloxx-core/src/index";
import { createDailyScreens } from "./daily-screens";
import { acceptTrackedCity, claimMission, ensureMissions, recordRunProgress, rerollSaveMission } from "../../city-bloxx-core/src/index";
import { createProgressionScreens, type RewardSaveStatus } from "./progression-screens";
import { DEFAULT_EQUIPMENT, equipmentFor, equipCosmetic, grantCosmetics, renderCosmetic, type RunEquipment } from "../../city-bloxx-core/src/cosmetics";
import { createBookScreens } from "./book-screens";
import { completeTutorial, type TutorialState } from "../../city-bloxx-core/src/save-state";
import type { RankedPort } from "../../city-bloxx-core/src/ports";

export type SessionScreen = "quick" | "city" | "daily" | "statistics" | "history" | "book" | "progression";
export function sessionScreen(value: string | null): SessionScreen {
  return ["quick","city","daily","statistics","history","book","progression"].includes(value??"") ? value as SessionScreen : "quick";
}

export interface SessionOptions {
  assets: string; save: SavePort; score?: ScorePort; lifecycle?: LifecyclePort;
  audio: AudioPort; seed: () => number; locale?: string; onLocaleChange?: (locale:string) => void;
  showLanguageSwitch?: boolean;
  capabilities?: Capabilities; tracking?: TrackingPort;
  initialScreen?: SessionScreen; initialReplayId?: string; presentation?: "game" | "content";
  onNavigate?: (screen: SessionScreen, replayId?: string) => void;
  ranked?: RankedPort;
}
export interface TowerSession { ready: Promise<void>; setLocale(locale:string): void; navigate(screen:SessionScreen,replayId?:string):void; checkpointAndPause():Promise<boolean>; whenSaved():Promise<void>; dispose(): void }
export function mountQuickTower(root: HTMLElement, options: SessionOptions): TowerSession {
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

  root.classList.add("cb-game");
  root.classList.toggle("cb-content-session",options.presentation === "content");
  root.lang=vi?"vi":"en";
  root.innerHTML = `
    <div class="cb-toolbar"><div class="cb-toolbar-title"><strong>${quickName()}</strong><span data-mode></span></div>
      <div class="cb-toolbar-controls">
      <button data-pause>${t("Pause")}</button>
      <button data-sound aria-pressed="false">${t("Sound on")}</button>
      <button data-motion aria-pressed="${reducedMotion}" title="${t("Limit decorative motion; scoring stays the same.")}">${t("Reduced motion")}</button>
      ${options.showLanguageSwitch === false ? "" : `<button data-language aria-label="${t("Language")}">${vi?"EN":"VI"}</button>`}
    </div></div>
    <div class="cb-hud">
      <div><span>${t("Population")}</span><strong data-population>0</strong></div>
      <div><span>${t("Floors")}</span><strong data-floors>0</strong></div>
      <div><span>${t("Lives")}</span><strong data-lives role="img" aria-label="${t("Lives")}: 3/3">${[0,1,2].map(index=>`<svg data-life="${index}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21C9 18.7 2 13.5 2 7.9C2 2.8 8.3 1.2 12 5.7C15.7 1.2 22 2.8 22 7.9C22 13.5 15 18.7 12 21Z"/><path class="cb-heart-shine" d="M5.1 7.9C5.1 5.9 7 5.4 8.3 6.4"/></svg>`).join("")}</strong></div>
      <div><span>${t("Best")}</span><strong data-best>0</strong></div>
    </div>
    <div class="cb-arena" tabindex="0" role="application" aria-label="${quickName()}">
      <canvas aria-label="${t("Tower")}"></canvas>
      <div class="cb-panel" role="dialog" aria-label="${t("Game menu")}"></div>
      <div class="cb-combo" aria-label="${t("Combo")}" hidden><span></span></div>
    </div>
    <div class="cb-tutorial" hidden><span></span><button data-tutorial-dismiss></button></div>
    <p class="cb-hint"></p><p class="cb-notice" role="status" aria-live="polite"></p>`;
  const el = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const arena = el(".cb-arena");
  const panel = el(".cb-panel");
  const hint = el(".cb-hint");
  const notice = el(".cb-notice");
  const tutorial=el(".cb-tutorial");let tutorialMode:keyof TutorialState="quick";
  const wt=(en:string,translation:string)=>{translations.set(en,translation);return vi?translation:en;};
  function tutorialHint(mode:keyof TutorialState, text:string):void {
    tutorialMode=mode;tutorial.hidden=save.tutorials[mode];
    tutorial.querySelector("span")!.textContent=text;
    el("[data-tutorial-dismiss]").textContent=wt("Dismiss tips","Ẩn mẹo");
  }
  const hud = new Map<string, HTMLElement>();
  function setText(selector: string, value: string): void {
    const node = hud.get(selector) ?? el(selector); hud.set(selector, node);
    if (node.textContent !== value) node.textContent = value;
  }
  const combo = el(".cb-combo span");
  const pauseButton = el<HTMLButtonElement>("[data-pause]");
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
  function button(label: string, action: () => void): HTMLButtonElement {
    const b = document.createElement("button"); b.type = "button"; b.textContent = label;
    b.addEventListener("click", action); return b;
  }
  function showPanel(title: string, body: string, actions: HTMLButtonElement[]): void {
    tutorial.hidden=true;
    panel.removeAttribute("aria-modal");
    dataScreens.clear();
    dailyScreens.clear();
    progressionScreens.clear();
    bookScreens.clear();
    panel.classList.remove("cb-city-panel", "cb-guide-panel", "cb-result-panel", "cb-data-panel", "cb-history-panel");
    panel.replaceChildren(); panel.hidden = false;
    const heading = document.createElement("h2"); heading.textContent = title;
    const text = document.createElement("p"); text.textContent = body;
    const buttons = document.createElement("div"); buttons.className = "cb-actions"; buttons.append(...actions);
    panel.append(heading, text, buttons); panel.setAttribute("aria-label",title);panel.tabIndex=-1;
    const firstEnabled=actions.find(b=>!b.disabled);if(firstEnabled)firstEnabled.focus({preventScroll:true});else panel.focus({preventScroll:true});
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
    catch { rewardSaveStatus = "error"; message(t("Save exceeds its budget. Your previous saved progress is preserved.")); return; }
    void saveController.write(value).then(success => {
      if (generation !== saveGeneration) return;
      rewardSaveStatus = success ? "saved" : "error";
      if (!success) message(t("Save failed. Your result is kept for this session; retry saving."));
      else message("");
      if (success && (userPaused || !run || run.getPhase() === "ended")) void options.save.flush?.();
    });
  }
  const dataScreens = createDataScreens({ panel, save: () => save, t, className, showPanel, showStats, button, home,
    replay: record => { dataScreens.clear(); void startReplay(record); },
    pin: id => { save = pinReplay(save, id); persist(); } });
  const dailyScreens = createDailyScreens({ panel, save: () => save, now, t, button, showPanel, showStats, home,
    online:options.ranked ? {label:()=>wt("Ranked Daily","Daily xếp hạng"),start:()=>{void startOnline("daily");}} : undefined,
    start: date => { void startDaily(date); }, resume: () => { void resumeDaily(); }, discard: discardDaily,
    replay: record => { void startReplay(record); } });
  const progressionLabel = () => vi ? "Tiến trình" : "Progression";
  const progressionResultLabel = () => vi ? "XP và nhiệm vụ" : "XP & missions";
  const progressionScreens = createProgressionScreens({ panel, save: () => save, now, locale: () => vi ? "vi" : "en", className, showPanel, button, home,
    claim: (date, id) => { if (rewardSaveStatus === "pending") return; save = claimMission(save, date, id, now()); persist(); },
    reroll: (date, id) => { if (rewardSaveStatus === "pending") return; save = rerollSaveMission(save, date, id, now()); persist(); },
    retry: persist, status: () => rewardSaveStatus, paused: () => hostPaused || userPaused, reducedMotion: () => reducedMotion });
  const bookLabel = () => vi ? "Sổ kiến trúc" : "Architecture Book";
  const bookScreens = createBookScreens({ panel, renderer, assets:options.assets, save: () => save, vi: () => vi, className, showPanel, button, home, saveStatus: () => rewardSaveStatus, retrySave: persist,
    equip: (id,equipment) => { if(rewardSaveStatus === "pending")return;let next=save;for(const item of [equipment.building,equipment.roof,equipment.crane])next=equipCosmetic(next,item,id);save=next;persist(); } });
  const dailyTimer = window.setInterval(() => { if (!hostPaused && !disposed) {
    if (ready) { const next = ensureMissions(save, now()); if (next !== save) { save = next; persist(); } }
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
    checkpointCity(); abandonQuick(); cityActive = false; mapView = false;
    cancelFrame(); run = null; replay = null; userPaused = false; celebrating = false; renderer.resetEffects(); paint();
    save = ensureMissions(save, now()); persist(); progressionScreens.menu();
  }
  function openBook(): void {
    checkpointCity();abandonQuick();cityActive=false;mapView=false;cancelFrame();run=null;replay=null;userPaused=false;celebrating=false;renderer.resetEffects();paint();bookScreens.book();
  }
  async function loadRunArtwork(id:BuildingId,equipment:RunEquipment):Promise<void> {
    try { await renderer.loadEquipment(id,equipment); }
    catch { message(t("Using fallback building art."));try{await renderer.loadBuilding(id);}catch{/* Colored fallback remains usable. */} }
    renderer.setEquipment(equipment);
  }
  function rewardButton(back: () => void): HTMLButtonElement | null {
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
    if (!run || run.config.mode !== "quick" || replay || !runContext) return;
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
  const idleSnapshot = new QuickTowerGame(1).getSnapshot();
  function current() { return replay?.getSnapshot() ?? run?.getSnapshot() ?? idleSnapshot; }
  function paint(s = current()): void {
    renderer.render(s, replay?.getPreviousRenderSnapshot(s) ?? run?.getPreviousRenderSnapshot(s), replay?.getInterpolationAlpha() ?? run?.getInterpolationAlpha() ?? 1, reducedMotion);
    if(mapView&&!run&&!replay) {
      setText(".cb-toolbar strong",cityName());setText("[data-mode]",t("Downtown"));
      showLives(3);
      setText("[data-population]",String(cityPopulation(save.city)));
      setText("[data-floors]",String(save.city.lots.reduce((sum,lot)=>sum+(lot?.floors??0),0)));
      combo.parentElement!.hidden=true;pauseButton.disabled=true;
      setText(".cb-hint",t("Complete a tier to unlock the next. A roof is a separate drop."));
      return;
    }
    const daily = replay?.record.config.daily ?? run?.config.daily;
    setText(".cb-toolbar strong", daily ? t("Daily Tower") : s.targetFloors ? cityName() : quickName());
    setText("[data-population]", String(s.population));
    setText("[data-floors]", s.targetFloors ? `${s.floors.length}/${s.targetFloors}${s.isRoof && !s.roof ? " ▲" : ""}` : String(s.floors.length));
    showLives(s.lives);
    setText("[data-best]", String(daily ? save.daily.days.find(d => d.dateUTC === daily.dateUTC)?.bestComplete?.result.population ?? 0 : s.assist ? save.assistQuickBest : save.standardQuickBest));
    const comboWidth = `${s.comboRatio * 100}%`;
    combo.parentElement!.hidden = !(s.comboLevel > 0 && s.comboRatio > 0 && panel.hidden);
    if (combo.style.width !== comboWidth) combo.style.width = comboWidth;
    setText("[data-mode]", replay ? t("Replay") : daily ? `${daily.dateUTC} UTC` : s.targetFloors ? className(s.building) : s.assist ? t("Assist · unranked") : t("Standard"));
    pauseButton.disabled = !run && !replay || s.phase === "ended" && !celebrating;
    let hintText = !replay ? s.drops.length === 0 ? t("1/3 · Tap, click, Space or Enter to drop one floor.") :
      s.drops.length === 1 ? t("2/3 · Aim at the moving top of the tower. Three misses end the run.") :
      s.drops.length === 2 ? t("3/3 · Perfect refreshes combo and steadies the tower.") : t("Drop on the tower · Perfect keeps the combo alive") : t("Recorded inputs · Replay never submits a score");
    if (s.targetFloors && s.isRoof && s.phase !== "ended") hintText = t("Final drop: place the roof. You only get one attempt.");
    setText(".cb-hint", hintText);
    if(run?.config.mode === "quick" && !replay && panel.hidden && !save.tutorials.quick){
      if(s.drops.length>=3){save=completeTutorial(save,"quick");tutorial.hidden=true;persist();}
      else tutorialHint("quick",hintText);
    }else if(panel.hidden || replay) tutorial.hidden=true;
  }
  function cancelFrame(): void { cancelAnimationFrame(raf); raf = 0; lastTime = 0; }
  function schedule(): void { if (!disposed && !raf && !userPaused && !hostPaused && (run || replay) && ((replay?.getPhase() ?? run?.getPhase()) !== "ended" || celebrating)) raf = requestAnimationFrame(frame); }
  async function start(assist = false, ranked = false): Promise<void> {
    const generation=++startGeneration;
    mapView=false;
    checkpointCity(); abandonQuick(); cityActive = false;
    cancelFrame(); replay = null; finishedRecord = null;
    run = null;pauseButton.disabled=true;
    renderer.resetEffects(); celebrating = false;
    showPanel(t("Preparing tower"),t("Loading artwork…"),[]);
    // Lazy assets still load only after Play, but decoding never competes with a moving crane.
    const equipment=equipmentFor(save,"residential");await loadRunArtwork("residential",equipment);if(disposed||generation!==startGeneration)return;
    const ticket = ranked ? await options.ranked!.start("quick") : null;
    if(disposed||generation!==startGeneration)return;
    rankedId=ticket?.id ?? null;
    run = new QuickTowerGame(ticket?.config ?? { seed: options.seed(), mode: "quick", assist });
    const previousSave=save;
    const allocated = allocateRun(save, now()); save = allocated.save; runContext = { ...allocated.context,equipment };
    try { if(ticket)await options.ranked!.bind(ticket.id,runContext.identity.id); } catch(error) { save=previousSave;run=null;runContext=null;rankedId=null;throw error; }
    if(disposed||generation!==startGeneration)return;
    save = { ...save, tracking: { ...save.tracking, activeQuick: { ...runContext, progress: makeSummary(run, runContext, now(), "abandoned") } } }; persist();
    if(ticket){flushSave();await saveController.flush();if(rewardSaveStatus==="error"){void options.ranked!.abandon(runContext.identity.id).catch(()=>{});save=previousSave;run=null;runContext=null;rankedId=null;throw new Error("storage");}}
    if(disposed||generation!==startGeneration)return;
    lastFeedback = 0; userPaused = false;
    panel.hidden = true; pauseButton.textContent = t("Pause"); arena.focus(); paint();
    syncPause(); schedule();
  }
  async function startReplay(record: RunRecord): Promise<void> {
    startGeneration++;
    if(options.presentation === "content" && options.onNavigate){options.onNavigate("history",save.replays.find(r=>r.record===record)?.id);return;}
    mapView=false;
    checkpointCity(); abandonQuick(); cityActive = false;
    rankedId=null;
    try { replay = new QuickTowerReplay(record); } catch { message(t("Replay is incompatible.")); return; }
    cancelFrame(); run = null; userPaused = false; lastFeedback = 0;
    renderer.resetEffects(); celebrating = false;
    pauseButton.disabled=true;
    showPanel(t("Preparing replay"),t("Loading artwork…"),[]);
    const entry=save.replays.find(r=>r.record===record||JSON.stringify(r.record)===JSON.stringify(record));
    const equipment=save.history.find(h=>h.identity.id===entry?.id)?.equipment??{...DEFAULT_EQUIPMENT};
    await loadRunArtwork(record.config.building ?? "residential",equipment);if(disposed)return;
    panel.hidden = true; pauseButton.textContent = t("Pause"); paint(); syncPause(); schedule();
  }
  function home(): void {
    startGeneration++;
    if(options.presentation === "content" && ready && options.onNavigate){options.onNavigate("quick");return;}
    mapView=false;
    checkpointCity(); abandonQuick(); cityActive = false;
    cancelFrame(); run = null; replay = null; userPaused = false; paint();
    rankedId=null;
    celebrating=false; renderer.resetEffects();
    const actions = [button(t("Play Standard"), () => start()), button(t("Play Assist"), () => start(true)), button(t("Build City"), cityMap), button(t("Daily Tower"), openDaily)];
    if(options.ranked)actions.splice(1,0,button(wt("Ranked Quick","Quick xếp hạng"),()=>{void startOnline("quick");}),button(wt("Ranked Daily","Daily xếp hạng"),()=>{void startOnline("daily");}));
    if (save.lastReplay) actions.push(button(t("Last replay"), () => startReplay(save.lastReplay!)));
    actions.push(button(t("Build City guide"), () => showGuide(0,home)));
    actions.push(button(t("Statistics"), () => openData()), button(t("History"), () => openData(true)));
    actions.push(button(progressionLabel(), openProgression));
    actions.push(button(bookLabel(),openBook));
    if (!storageWritable) actions.push(button(t("Recover saved progress"), confirmRecovery));
    showPanel(quickName(), t("Build as high as you can. Three misses end your run. Assist swings slower and has its own best score."), actions);
  }
  function showOnlineError(): void {
    loadingDaily=false;
    if(disposed)return;
    showPanel(wt("Online run not started","Chưa bắt đầu lượt online"),wt("Check Ranked for sign-in, verification, storage or connection status. You can still choose personal play.","Mở Xếp hạng để xem đăng nhập, xác minh, bộ nhớ hoặc kết nối. Bạn vẫn có thể chọn chơi cá nhân."),[button(wt("Personal play","Chơi cá nhân"),home)]);
  }
  async function startOnline(mode:"quick"|"daily"):Promise<void> {
    if(!options.ranked||rankedStarting||!storageWritable)return;
    if(mode==="daily"&&save.daily.pending){
      showPanel(t("Replace pending Daily?"),wt("Resume keeps the original run and its online eligibility.","Tiếp tục giữ lượt cũ và trạng thái online ban đầu."),[
        button(t("Resume Daily"),()=>{void resumeDaily();}),button(t("Discard and play today"),()=>{discardDaily();void startOnline("daily");}),button(t("Keep pending Daily"),openDaily)]);return;
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
    muted = save.settings.muted; reducedMotion = save.settings.reducedMotion ?? motionQuery.matches;
    if (muted) options.audio.suspend();
    el("[data-sound]").textContent = muted ? t("Sound off") : t("Sound on");
    el("[data-sound]").setAttribute("aria-pressed", String(muted));
    el("[data-motion]").setAttribute("aria-pressed", String(reducedMotion));
    if (options.showLanguageSwitch !== false && save.settings.locale) setLocale(save.settings.locale);
    save = { ...save, settings: { ...save.settings, locale: vi ? "vi" : "en" } };
  }
  function loadedSave(value: GameSave): void {
    save = initializeTracking(value, installationId(), now());
    if (save.tracking.activeQuick?.progress) save = settleRun(save, save.tracking.activeQuick.progress);
    ensurePendingContext();
    save = ensureMissions(save, now());
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
      if (!disposed) { storageWritable = false; home(); message(t("Save could not be read. Playing without saving to protect your old progress.")); }
    } finally { recovering = false; }
  }
  function results(isReplay = false): void {
    if ((isReplay ? replay?.record.config.mode : run?.config.mode) === "daily") { dailyResults(isReplay); return; }
    if (cityActive && !isReplay) { cityResults(); return; }
    const result = isReplay ? replay!.getResult() : run!.getResult();
    if (!isReplay) {
      const wasSettled = !!runContext && isSettled(save, runContext.identity);
      settleCurrent();
      if (!wasSettled && result.ranked && options.capabilities?.standardScore !== false) void options.score?.submitStandardQuick(result.population).catch(() => message(t("Score submission failed.")));
    }
    const record = isReplay ? replay!.record : finishedRecord;
    const actions = [button(rankedId&&!isReplay ? wt("Ranked again","Chơi xếp hạng lại") : t("Build again"), () => rankedId&&!isReplay ? startOnline("quick") : start(!result.ranked))];
    if (record && record.endTick <= 432000 && record.inputs.length <= 4096) actions.push(button(t("Replay / restart"), () => startReplay(record)));
    actions.push(button(t("Home"), home), button(t("Retry save"), persist));
    const rewards = !isReplay ? rewardButton(() => results()) : null; if (rewards) actions.push(rewards);
    const body = result.ranked ? t("Standard") : t("Assist · unranked");
    showPanel(`${isReplay ? t("Replay complete") : t("Tower complete")} · ${result.rating}`, body, actions);
    showStats([[t("Population"),String(result.population)],[t("Floors"),String(result.height)],
      [t("Accuracy"),`${result.accuracy.toFixed(1)}%`],[t("Perfect"),String(result.perfectCount)],
      [t("Best streak"),String(result.bestStreak)],[t("Duration"),`${(result.durationTicks/60).toFixed(1)}s`]]);
    if(rankedId&&!isReplay){const status=document.createElement("p");status.textContent=wt("Online result: open Ranked for verification status. Local rewards are granted once.","Kết quả online: mở Xếp hạng xem xác minh. Thưởng cá nhân chỉ nhận một lần.");panel.append(status);}
    paint();
  }
  function frame(time: number): void {
    raf = 0;
    if (disposed || hostPaused || userPaused) return;
    const delta = lastTime ? (time - lastTime) / 1000 : 0; lastTime = time;
    renderer.updateEffects(delta);
    if (replay) replay.update(delta); else run?.update(delta);
    const s = current();
    if (s.feedbackId !== lastFeedback) {
      lastFeedback = s.feedbackId;
      checkpointCity();
      if (!muted && s.lastPlacement) options.audio.play(s.lastPlacement);
    }
    paint(s);
    if (s.phase === "ended") {
      celebrating = !!s.targetFloors && renderer.hasPopulationEffect();
      if (celebrating) schedule(); else results(!!replay);
    } else schedule();
  }
  function syncPause(): void {
    const paused = userPaused || hostPaused;
    run?.setPaused(paused); replay?.setPaused(paused);
    if (paused) {
      checkpointCity();
      cancelFrame(); options.audio.suspend();
      if ((run || replay) && (current().phase !== "ended" || celebrating)) {
        const actions = hostPaused ? [] : [button(t("Resume"), () => { userPaused = false; syncPause(); }), ...(replay ? [button(t("Restart replay"), () => startReplay(replay!.record))] : []), button(cityActive ? t("City map") : t("Home"), cityActive ? cityMap : home)];
        showPanel(t("Paused"), t("Your game clock is stopped."), actions);
      }
    } else {
      if ((run || replay) && (current().phase !== "ended" || celebrating)) { panel.hidden = true; arena.focus(); }
      lastTime = 0; schedule();
    }
    pauseButton.textContent = userPaused ? t("Resume") : t("Pause");
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
    startGeneration++;
    checkpointCity(); abandonQuick(); cancelFrame(); run = null; replay = null; runContext = null; cityActive = false; mapView = false;
    rankedId=null;
    userPaused = false; celebrating = false; renderer.resetEffects(); paint(); dailyScreens.entry();
    tutorialHint("daily",wt("Daily keeps its starting UTC date. Build 20 Industrial bodies, then try the roof once.","Daily giữ ngày UTC lúc bắt đầu. Xây 20 tầng thân Công nghiệp rồi thử mái một lần."));
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
    if (loadingDaily || save.daily.pending) return;
    const definition = resolveDaily(dateUTC);
    const generation=++startGeneration;
    checkpointCity(); abandonQuick(); cancelFrame(); run = null; replay = null; cityActive = false; mapView = false; loadingDaily = true;
    renderer.resetEffects(); celebrating = false; showPanel(t("Preparing tower"), t("Loading artwork…"), []);
    const equipment=equipmentFor(save,definition.classId);await loadRunArtwork(definition.classId,equipment);
    if(disposed||generation!==startGeneration){loadingDaily=false;return;}
    const ticket=ranked ? await options.ranked!.start("daily") : null;
    loadingDaily = false; if (disposed || save.daily.pending || generation!==startGeneration) return;
    rankedId=ticket?.id ?? null;
    run = new QuickTowerGame(ticket?.config ?? { mode: "daily", assist: false, seed: definition.seed, building: definition.classId, daily: definition });
    const previousSave=save;
    const allocated = allocateRun(save, now()); save = allocated.save; runContext = { ...allocated.context,equipment };
    try{if(ticket)await options.ranked!.bind(ticket.id,runContext.identity.id);}catch(error){save=previousSave;run=null;runContext=null;rankedId=null;throw error;}
    if(disposed||generation!==startGeneration)return;
    save = { ...save, daily: beginDaily(save.daily, run, runContext) }; finishedRecord = null; persist();
    if(ticket){flushSave();await saveController.flush();if(rewardSaveStatus==="error"){void options.ranked!.abandon(runContext.identity.id).catch(()=>{});save=previousSave;run=null;runContext=null;rankedId=null;throw new Error("storage");}}
    if(disposed||generation!==startGeneration)return;
    lastFeedback = 0; userPaused = false; panel.hidden = true; pauseButton.textContent = t("Pause"); arena.focus(); paint(); syncPause(); schedule();
  }
  async function resumeDaily(): Promise<void> {
    const generation=++startGeneration;
    if(options.presentation === "content" && options.onNavigate){options.onNavigate("daily");return;}
    const pending = save.daily.pending; if (!pending || loadingDaily) return;
    checkpointCity(); abandonQuick(); cancelFrame(); run = null; replay = null; cityActive = false; mapView = false; loadingDaily = true;
    showPanel(t("Preparing tower"), t("Loading artwork…"), []);
    await loadRunArtwork(pending.checkpoint.config.building!,pending.equipment??{...DEFAULT_EQUIPMENT});
    loadingDaily = false; if (disposed || generation!==startGeneration || save.daily.pending?.identity.id !== pending.identity.id) return;
    try{rankedId=await options.ranked?.resume(pending.identity.id,pending.checkpoint.config) ?? null;}catch{showOnlineError();return;}
    if(disposed||generation!==startGeneration)return;
    run = restoreTower(pending.checkpoint); runContext = pending; renderer.resetEffects(run.getSnapshot().feedbackId); celebrating = false;
    userPaused = false; lastFeedback = run.getSnapshot().feedbackId; panel.hidden = true; pauseButton.textContent = t("Pause"); paint();
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
    if(rankedId&&!isReplay){const status=document.createElement("p");status.textContent=wt("Online result: open Ranked for verification status. Local rewards are granted once.","Kết quả online: mở Xếp hạng xem xác minh. Thưởng cá nhân chỉ nhận một lần.");panel.append(status);panel.querySelector(".cb-actions")?.append(button(wt("Ranked Daily again","Chơi Daily xếp hạng lại"),()=>{void startOnline("daily");}));}
    const rewards = !isReplay ? rewardButton(() => dailyResults()) : null; if (rewards) panel.querySelector(".cb-actions")!.append(rewards);
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
  function cityMap(): void {
    startGeneration++;
    mapView=true;
    checkpointCity(); abandonQuick(); cancelFrame(); run = null; replay = null; cityActive = false; userPaused = false; paint();
    rankedId=null;
    const city = save.city, status = placementStatus(city, selectedLot, selectedClass), old = city.lots[selectedLot];
    const summary = `${cityPopulation(city)} ${t("city population")} · ${city.lots.filter(Boolean).length}/25 ${t("lots")}\n${t("Select a lot and class. Green highlights legal locations.")}`;
    const actions: HTMLButtonElement[] = [];
    if (city.pending) {
      actions.push(button(t("Resume tower"), () => { void resumeCity(); }), button(t("Cancel pending tower"), () => {
        showPanel(t("Cancel construction?"), t("The old building, if any, will be kept. Pending progress will be discarded."), [button(t("Confirm cancel"), () => { discardPendingCity(); cityMap(); }), button(t("Back"), cityMap)]);
      }));
    } else {
      const build = button(old ? t("Rebuild selected lot") : t("Build selected lot"), () => { void beginSelectedCity(); });
      build.disabled = !status.valid || loadingCity; actions.push(build);
      if (old) actions.push(button(t("Demolish"), () => {
        showPanel(t("Demolish building?"), `${t("Population change")}: -${old.population}.\n${t("Existing neighbors and unlocked classes stay intact.")}`, [button(t("Confirm demolition"), () => { save.city = demolishCityBuilding(save.city, selectedLot); persist(); cityMap(); }), button(t("Back"), cityMap)]);
      }));
    }
    actions.push(button(t("Home"), home), button(t("Retry save"), persist));
    actions.push(button(t("Guide"), () => showGuide(0,cityMap)));
    showPanel(t("Build City · Downtown"), summary, actions);
    tutorialHint("city",wt("Select the highlighted lot, then a class. Higher classes need completed neighbors sharing an edge.","Chọn ô được đánh dấu rồi chọn loại nhà. Loại cao hơn cần nhà hoàn thành kề cạnh."));
    panel.classList.add("cb-city-panel");
    const classes = document.createElement("div"); classes.className = "cb-city-classes";
    for (const id of BUILDING_IDS) {
      const b = button(`${className(id)} · ${BUILDINGS[id].floors}${city.unlocked.includes(id) ? "" : " 🔒"}`, () => { selectedClass = id; cityMap(); });
      b.dataset.class = id; b.style.borderColor = BUILDINGS[id].color; b.setAttribute("aria-pressed", String(id === selectedClass)); classes.append(b);
    }
    const grid = document.createElement("div"); grid.className = "cb-city-grid"; grid.setAttribute("role", "group"); grid.setAttribute("aria-label", t("Downtown 5 by 5 lots"));
    grid.style.backgroundImage = `url('${options.assets}/bg/default/bg_downtown_default_map.png')`;
    for (let index = 0; index < 25; index++) {
      const lot = city.lots[index], valid = placementStatus(city, index, selectedClass).valid;
      const b = button("", () => { selectedLot = index; cityMap(); });
      b.dataset.lot = String(index); b.dataset.valid = String(valid); b.setAttribute("aria-pressed", String(index === selectedLot));
      const lotStatus = placementStatus(city, index, selectedClass);
      b.title = `(${Math.floor(index / 5) + 1},${index % 5 + 1}) · ${lotStatus.locked ? t("Locked: complete and accept the previous tier.") : lotStatus.missing.length ? `${t("Needs edge-adjacent")}: ${lotStatus.missing.map(className).join(" + ")}` : t("Click to select this valid lot")}`;
      b.setAttribute("aria-label", `${t("Lot")} ${index + 1}: ${lot ? `${className(lot.classId)}, ${lot.floors} ${t("floors")}, ${lot.population} ${t("people")}` : t("empty")}`);
      if (lot) {
        const image = document.createElement("img"),set=renderCosmetic(lot.skin,"building",lot.classId).set; image.src = `${options.assets}/city/${set}/city_${lot.classId}_${set}_mini.png`; image.alt = ""; image.draggable = false;
        let defaultTried=set === "default";image.addEventListener("error", () => { if(!defaultTried){defaultTried=true;image.src=`${options.assets}/city/default/city_${lot.classId}_default_mini.png`;}else {image.remove();b.style.backgroundColor=BUILDINGS[lot.classId].color;} }); b.append(image);
      }
      const label = document.createElement("span"); label.textContent = lot ? `${lot.floors}${lot.roof ? " ▲" : ""}` : String(index + 1); b.append(label); grid.append(b);
    }
    const detail = document.createElement("p"); detail.className = "cb-city-detail";
    detail.textContent = `${t("Lot")} ${selectedLot + 1} · ${className(selectedClass)}\n${old ? `${t("Current")}: ${old.population} ${t("people")} · ${old.rating}\n` : ""}${status.locked ? t("Locked: complete and accept the previous tier first.") : status.missing.length ? `${t("Needs adjacent")}: ${status.missing.map(className).join(" + ")}` : t("Valid placement. Only four-direction neighbors count.")}`;
    detail.textContent += ` · (${Math.floor(selectedLot / 5) + 1},${selectedLot % 5 + 1})`;
    detail.title = t("Click/tap selects a lot; hovering only previews its tooltip. Diagonals do not count.");
    if (!status.locked && !city.lots.some((lot, index) => !lot && placementStatus(city, index, selectedClass).valid)) {
      detail.textContent += `\n${t("No valid empty lot. Add a supporting neighbor.")}`;
    }
    panel.insertBefore(classes, panel.querySelector(".cb-actions")); panel.insertBefore(grid, panel.querySelector(".cb-actions")); panel.insertBefore(detail, panel.querySelector(".cb-actions"));
    hint.textContent = t("Complete a tier to unlock the next. A roof is a separate drop.");
    el("[data-population]").textContent = String(cityPopulation(city));
    el("[data-floors]").textContent = String(city.lots.reduce((sum,lot)=>sum+(lot?.floors??0),0));
    el(".cb-toolbar strong").textContent = cityName();
    el("[data-mode]").textContent = t("Downtown");
  }
  async function beginSelectedCity(): Promise<void> {
    if (loadingCity || save.city.pending || !placementStatus(save.city, selectedLot, selectedClass).valid) return;
    loadingCity = true;
    const lot = selectedLot, id = selectedClass;
    showPanel(t("Preparing construction"), t("Loading building artwork…"), []);
    const equipment=equipmentFor(save,id);await loadRunArtwork(id,equipment);
    loadingCity = false; if (disposed) return;
    save.city = beginCityTower(save.city, lot, id, options.seed(),equipment); ensurePendingContext(now()); persist();
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
    pauseButton.textContent = t("Pause"); paint();
    if (run.getPhase() === "ended") cityResults(); else { syncPause(); schedule(); arena.focus(); }
  }
  function cityResults(): void {
    checkpointCity();
    const pending = save.city.pending; if (!pending || !run) return;
    const result = run.getResult(), s = run.getSnapshot(), old = save.city.lots[pending.lot];
    const complete = result.height === BUILDINGS[pending.classId].floors;
    const body = `${className(pending.classId)}\n${s.roof ? t("Roof placed") : complete ? t("Body complete, roof missed") : t("Unfinished tower · no completion unlock")}\n${old ? `${t("Old building stays until you accept")}: ${old.population}` : ""}`;
    const actions = [button(result.height ? t("Accept building") : t("Return to city"), () => {
      save = acceptTrackedCity(save, pending.runId, now()); cityActive = false; runContext = null; persist(); cityMap();
    }), button(old ? t("Keep old building") : t("Discard tower"), () => { discardPendingCity(); cityMap(); }), button(t("Retry save"), persist)];
    const rewards = rewardButton(cityResults); if (rewards) actions.push(rewards);
    showPanel(`${t("City tower complete")} · ${result.rating}`, body, actions);
    showStats([[t("Population"),String(result.population)],[t("Floors"),`${result.height}/${BUILDINGS[pending.classId].floors}`],
      [t("Accuracy"),`${result.accuracy.toFixed(1)}%`],[t("Perfect"),String(result.perfectCount)],
      [t("Best streak"),String(result.bestStreak)],[t("Duration"),`${(result.durationTicks/60).toFixed(1)}s`]]);paint();
  }
  listen(arena, "pointerdown", ((event: PointerEvent) => {
    if (event.button !== 0 || !event.isPrimary || (event.target as HTMLElement).closest("button,.cb-panel")) return;
    event.preventDefault(); arena.focus(); drop();
  }) as EventListener);
  listen(arena, "keydown", ((event: KeyboardEvent) => {
    if ((event.key !== " " && event.key !== "Enter") || event.repeat || (event.target as HTMLElement).closest("button")) return;
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
    save = { ...save, settings: { ...save.settings, locale: vi ? "vi" : "en" } }; persist();
    // Pause and Paused share a Vietnamese translation; restore controls from state, not reverse text.
    pauseButton.textContent=userPaused?t("Resume"):t("Pause");
    el("[data-sound]").textContent=muted?t("Sound off"):t("Sound on");
    el("[data-motion]").textContent=t("Reduced motion");
    const languageButton=root.querySelector("[data-language]");if(languageButton)languageButton.textContent=vi?"EN":"VI";
    if(guidePage>=0)showGuide(guidePage,guideBack);else if(bookScreens.isOpen())bookScreens.refresh();else if(progressionScreens.isOpen())progressionScreens.refresh();else if(dataScreens.isOpen())dataScreens.refresh();else if(dailyScreens.isOpen()) {
      if(rankedId&&run?.config.mode==="daily"&&run.getPhase()==="ended"&&!replay){dailyResults();return;}
      dailyScreens.refresh(); const rewards = run?.config.mode === "daily" && run.getPhase() === "ended" && !replay ? rewardButton(() => dailyResults()) : null;
      if(rewards)panel.querySelector(".cb-actions")!.append(rewards);
    }else if(run||replay)paint();else if(panel.classList.contains("cb-city-panel"))cityMap();
    if(shownTutorial && tutorialMode==="daily")tutorialHint("daily",wt("Daily keeps its starting UTC date. Build 20 Industrial bodies, then try the roof once.","Daily giữ ngày UTC lúc bắt đầu. Xây 20 tầng thân Công nghiệp rồi thử mái một lần."));
  }
  const languageButton=root.querySelector("[data-language]");
  if(languageButton)listen(languageButton,"click",()=>{const locale=vi?"en":"vi";setLocale(locale);options.onLocaleChange?.(locale);});
  listen(window, "pagehide", () => { checkpointCity(); flushSave(); });
  listen(el("[data-sound]"), "click", () => {
    muted = !muted; if (muted) options.audio.suspend();
    el("[data-sound]").textContent = muted ? t("Sound off") : t("Sound on");
    el("[data-sound]").setAttribute("aria-pressed", String(muted));
    save = { ...save, settings: { ...save.settings, muted } }; persist();
  });
  listen(el("[data-motion]"), "click", () => { reducedMotion = !reducedMotion; el("[data-motion]").setAttribute("aria-pressed", String(reducedMotion)); save = { ...save, settings: { ...save.settings, reducedMotion } }; persist(); if(progressionScreens.isOpen())progressionScreens.refresh(); });
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
      if(screen==="city")cityMap();else if(screen==="daily")openDaily();
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
    try {
      const value = await saveController.load();
      if (disposed) return;
      loadedSave(value);
    }
    catch { storageWritable = false; message(t("Save could not be read. Playing without saving to protect your old progress.")); }
    await load;
    if (disposed) return;
    applySettings();
    ready = true; renderer.resize(arena.clientWidth, arena.clientHeight);
    if(options.initialScreen)navigate(options.initialScreen,options.initialReplayId);else home();persist();
  })();
  return { ready: readyPromise, setLocale, navigate, whenSaved: () => saveController.flush(), async checkpointAndPause() { userPaused=true;syncPause();checkpointCity();flushSave(); await saveController.flush(); return storageWritable && rewardSaveStatus !== "error"; }, dispose() {
    checkpointCity(); abandonQuick(); flushSave();
    progressionScreens.clear();
    bookScreens.clear();
    disposed = true;startGeneration++; saveController.dispose(); cancelFrame(); abort.abort(); cleanups.forEach(fn => fn());
    options.audio.dispose(); root.replaceChildren();
  } };
}
