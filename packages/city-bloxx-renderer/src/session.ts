import { acceptCityTower, beginCityTower, BUILDING_IDS, BUILDINGS, cancelCityTower, cityPopulation, commitRun, demolishCityBuilding, emptySave, placementStatus, QuickTowerGame, QuickTowerReplay, restoreTower, updateCityCheckpoint, type AudioPort, type BuildingId, type GameSave, type LifecyclePort, type RunRecord, type SavePort, type ScorePort } from "../../city-bloxx-core/src/index";
import { QuickTowerRenderer } from "./index";
import { cityGuide } from "./city-guide";

export interface SessionOptions {
  assets: string; save: SavePort; score?: ScorePort; lifecycle?: LifecyclePort;
  audio: AudioPort; seed: () => number; locale?: string; onLocaleChange?: (locale:string) => void;
  showLanguageSwitch?: boolean;
}
export interface TowerSession { ready: Promise<void>; setLocale(locale:string): void; dispose(): void }
export function mountQuickTower(root: HTMLElement, options: SessionOptions): TowerSession {
  let vi = !!options.locale?.startsWith("vi");
  const translations = new Map<string,string>();
  const t = (en: string, vn: string) => { translations.set(en,vn); return vi ? vn : en; };
  const quickName = () => t("Quick Tower", "Xây tháp nhanh");
  const cityName = () => t("Build City", "Xây thành phố");
  const abort = new AbortController();
  const cleanups: (() => void)[] = [];
  let disposed = false;
  let ready = false;
  let storageWritable = true;
  let save = emptySave();
  let saveQueue = Promise.resolve();
  let run: QuickTowerGame | null = null;
  let replay: QuickTowerReplay | null = null;
  let finishedRecord: RunRecord | null = null;
  let cityActive = false;
  let mapView = false;
  let selectedLot = 12;
  let selectedClass: BuildingId = "residential";
  let loadingCity = false;
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
  root.lang=vi?"vi":"en";
  root.innerHTML = `
    <div class="cb-toolbar"><div class="cb-toolbar-title"><strong>${quickName()}</strong><span data-mode></span></div>
      <div class="cb-toolbar-controls">
      <button data-pause>${t("Pause", "Tạm dừng")}</button>
      <button data-sound aria-pressed="false">${t("Sound on", "Bật tiếng")}</button>
      <button data-motion aria-pressed="${reducedMotion}" title="${t("Limit decorative motion; scoring stays the same.", "Bớt hiệu ứng chuyển động; cách chấm điểm không đổi.")}">${t("Reduced motion", "Giảm chuyển động")}</button>
      ${options.showLanguageSwitch === false ? "" : `<button data-language aria-label="${t("Language", "Ngôn ngữ")}">${vi?"EN":"VI"}</button>`}
    </div></div>
    <div class="cb-hud">
      <div><span>${t("Population", "Dân số")}</span><strong data-population>0</strong></div>
      <div><span>${t("Floors", "Tầng")}</span><strong data-floors>0</strong></div>
      <div><span>${t("Lives", "Mạng")}</span><strong data-lives role="img" aria-label="${t("Lives", "Mạng")}: 3/3">${[0,1,2].map(index=>`<svg data-life="${index}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21C9 18.7 2 13.5 2 7.9C2 2.8 8.3 1.2 12 5.7C15.7 1.2 22 2.8 22 7.9C22 13.5 15 18.7 12 21Z"/><path class="cb-heart-shine" d="M5.1 7.9C5.1 5.9 7 5.4 8.3 6.4"/></svg>`).join("")}</strong></div>
      <div><span>${t("Best", "Kỷ lục")}</span><strong data-best>0</strong></div>
    </div>
    <div class="cb-arena" tabindex="0" role="application" aria-label="${quickName()}">
      <canvas aria-label="${t("Tower", "Tòa nhà")}"></canvas>
      <div class="cb-panel" role="dialog" aria-label="${t("Game menu", "Menu trò chơi")}"></div>
      <div class="cb-combo" aria-label="${t("Combo", "Chuỗi thưởng")}" hidden><span></span></div>
    </div>
    <p class="cb-hint"></p><p class="cb-notice" role="status" aria-live="polite"></p>`;
  const el = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const arena = el(".cb-arena");
  const panel = el(".cb-panel");
  const hint = el(".cb-hint");
  const notice = el(".cb-notice");
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
    el("[data-lives]").setAttribute("aria-label",`${t("Lives","Mạng")}: ${lives}/3`);
    root.querySelectorAll<SVGElement>("[data-life]").forEach((heart,index)=>heart.classList.toggle("cb-heart-empty",index>=lives));
  }
  const renderer = new QuickTowerRenderer(el<HTMLCanvasElement>("canvas"), options.assets);
  renderer.setLocale(vi?"vi":"en");
  const listen = (target: EventTarget, event: string, callback: EventListener) => target.addEventListener(event, callback, { signal: abort.signal });
  function message(value: string): void { if (!disposed) notice.textContent = value; }
  function button(label: string, action: () => void): HTMLButtonElement {
    const b = document.createElement("button"); b.type = "button"; b.textContent = label;
    b.addEventListener("click", action); return b;
  }
  function showPanel(title: string, body: string, actions: HTMLButtonElement[]): void {
    panel.classList.remove("cb-city-panel", "cb-guide-panel", "cb-result-panel");
    panel.replaceChildren(); panel.hidden = false;
    const heading = document.createElement("h2"); heading.textContent = title;
    const text = document.createElement("p"); text.textContent = body;
    const buttons = document.createElement("div"); buttons.className = "cb-actions"; buttons.append(...actions);
    panel.append(heading, text, buttons); actions[0]?.focus();
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
    if (!storageWritable) return;
    const value = JSON.parse(JSON.stringify(save)) as GameSave;
    saveQueue = saveQueue.then(async () => {
      try { if (!await options.save.save(value)) message(t("Save failed. Your result is kept for this session; retry saving.", "Lưu thất bại. Kết quả vẫn còn trong phiên này; bấm lưu lại.")); }
      catch { message(t("Save failed; retry saving.", "Lưu thất bại; bấm lưu lại.")); }
    });
  }
  const idleSnapshot = new QuickTowerGame(1).getSnapshot();
  function current() { return replay?.getSnapshot() ?? run?.getSnapshot() ?? idleSnapshot; }
  function paint(s = current()): void {
    renderer.render(s, replay?.getPreviousRenderSnapshot(s) ?? run?.getPreviousRenderSnapshot(s), replay?.getInterpolationAlpha() ?? run?.getInterpolationAlpha() ?? 1, reducedMotion);
    if(mapView&&!run&&!replay) {
      setText(".cb-toolbar strong",cityName());setText("[data-mode]",t("Downtown","Trung tâm"));
      showLives(3);
      setText("[data-population]",String(cityPopulation(save.city)));
      setText("[data-floors]",String(save.city.lots.reduce((sum,lot)=>sum+(lot?.floors??0),0)));
      combo.parentElement!.hidden=true;pauseButton.disabled=true;
      setText(".cb-hint",t("Complete a tier to unlock the next. A roof is a separate drop.","Hoàn thành một cấp để mở cấp tiếp. Mái là một lần thả riêng."));
      return;
    }
    setText(".cb-toolbar strong", s.targetFloors ? cityName() : quickName());
    setText("[data-population]", String(s.population));
    setText("[data-floors]", s.targetFloors ? `${s.floors.length}/${s.targetFloors}${s.isRoof && !s.roof ? " ▲" : ""}` : String(s.floors.length));
    showLives(s.lives);
    setText("[data-best]", String(s.assist ? save.assistQuickBest : save.standardQuickBest));
    const comboWidth = `${s.comboRatio * 100}%`;
    combo.parentElement!.hidden = !(s.comboLevel > 0 && s.comboRatio > 0 && panel.hidden);
    if (combo.style.width !== comboWidth) combo.style.width = comboWidth;
    setText("[data-mode]", replay ? t("Replay", "Phát lại") : s.targetFloors ? className(s.building) : s.assist ? t("Assist · unranked", "Hỗ trợ · không xếp hạng") : t("Standard", "Tiêu chuẩn"));
    pauseButton.disabled = !run && !replay || s.phase === "ended" && !celebrating;
    let hintText = !replay ? s.drops.length === 0 ? t("1/3 · Tap, click, Space or Enter to drop one floor.", "1/3 · Chạm, click, Space hoặc Enter để thả một tầng.") :
      s.drops.length === 1 ? t("2/3 · Aim at the moving top of the tower. Three misses end the run.", "2/3 · Canh đỉnh tháp đang lắc. Trượt ba lần sẽ kết thúc.") :
      s.drops.length === 2 ? t("3/3 · Perfect refreshes combo and steadies the tower.", "3/3 · Hoàn hảo làm mới combo và giảm độ lắc.") : t("Drop on the tower · Perfect keeps the combo alive", "Thả vào đỉnh tháp · Hoàn hảo duy trì combo") : t("Recorded inputs · Replay never submits a score", "Phát input đã ghi · Replay không gửi điểm");
    if (cityActive && s.isRoof && s.phase !== "ended") hintText = t("Final drop: place the roof. You only get one attempt.", "Lần thả cuối: đặt mái. Chỉ có một lần thử.");
    setText(".cb-hint", hintText);
  }
  function cancelFrame(): void { cancelAnimationFrame(raf); raf = 0; lastTime = 0; }
  function schedule(): void { if (!disposed && !raf && !userPaused && !hostPaused && (run || replay) && ((replay?.getPhase() ?? run?.getPhase()) !== "ended" || celebrating)) raf = requestAnimationFrame(frame); }
  async function start(assist = false): Promise<void> {
    mapView=false;
    checkpointCity(); cityActive = false;
    cancelFrame(); replay = null; finishedRecord = null;
    run = null;pauseButton.disabled=true;
    renderer.resetEffects(); celebrating = false;
    showPanel(t("Preparing tower","Chuẩn bị tháp"),t("Loading artwork…","Đang tải hình ảnh…"),[]);
    // Lazy assets still load only after Play, but decoding never competes with a moving crane.
    await renderer.loadPopulation("residential");if(disposed)return;
    run = new QuickTowerGame({ seed: options.seed(), mode: "quick", assist });
    lastFeedback = 0; userPaused = false;
    panel.hidden = true; pauseButton.textContent = t("Pause", "Tạm dừng"); arena.focus(); paint();
    syncPause(); schedule();
  }
  async function startReplay(record: RunRecord): Promise<void> {
    mapView=false;
    checkpointCity(); cityActive = false;
    try { replay = new QuickTowerReplay(record); } catch { message(t("Replay is incompatible.", "Replay không tương thích.")); return; }
    cancelFrame(); run = null; userPaused = false; lastFeedback = 0;
    renderer.resetEffects(); celebrating = false;
    pauseButton.disabled=true;
    showPanel(t("Preparing replay","Chuẩn bị phát lại"),t("Loading artwork…","Đang tải hình ảnh…"),[]);
    await renderer.loadPopulation("residential");if(disposed)return;
    panel.hidden = true; pauseButton.textContent = t("Pause", "Tạm dừng"); paint(); syncPause(); schedule();
  }
  function home(): void {
    mapView=false;
    checkpointCity(); cityActive = false;
    cancelFrame(); run = null; replay = null; userPaused = false; paint();
    celebrating=false; renderer.resetEffects();
    const actions = [button(t("Play Standard", "Chơi tiêu chuẩn"), () => start()), button(t("Play Assist", "Chơi hỗ trợ"), () => start(true)), button(t("Build City", "Xây thành phố"), cityMap)];
    if (save.lastReplay) actions.push(button(t("Last replay", "Xem lượt trước"), () => startReplay(save.lastReplay!)));
    actions.push(button(t("Build City guide", "Hướng dẫn xây thành phố"), () => showGuide(0,home)));
    showPanel(quickName(), t("Build as high as you can. Three misses end your run. Assist swings slower and has its own best score.", "Xây tháp cao nhất có thể. Trượt ba lần sẽ kết thúc. Hỗ trợ đung đưa chậm hơn và có kỷ lục riêng."), actions);
  }
  function results(isReplay = false): void {
    if (cityActive && !isReplay) { cityResults(); return; }
    const result = isReplay ? replay!.getResult() : run!.getResult();
    if (!isReplay) {
      finishedRecord = run!.getRecord(); save = commitRun(save, finishedRecord); persist();
      if (result.ranked) void options.score?.submitStandardQuick(result.population).catch(() => message(t("Score submission failed.", "Gửi điểm thất bại.")));
    }
    const record = isReplay ? replay!.record : finishedRecord;
    const actions = [button(t("Build again", "Xây lại"), () => start(!result.ranked))];
    if (record && record.endTick <= 432000 && record.inputs.length <= 4096) actions.push(button(t("Replay / restart", "Xem lại từ đầu"), () => startReplay(record)));
    actions.push(button(t("Home", "Trang đầu"), home), button(t("Retry save", "Lưu lại"), persist));
    const body = result.ranked ? t("Standard", "Tiêu chuẩn") : t("Assist · unranked", "Hỗ trợ · không xếp hạng");
    showPanel(`${isReplay ? t("Replay complete", "Xem lại xong") : t("Tower complete", "Hoàn thành tháp")} · ${result.rating}`, body, actions);
    showStats([[t("Population","Dân số"),String(result.population)],[t("Floors","Tầng"),String(result.height)],
      [t("Accuracy","Độ chính xác"),`${result.accuracy.toFixed(1)}%`],[t("Perfect","Hoàn hảo"),String(result.perfectCount)],
      [t("Best streak","Chuỗi tốt nhất"),String(result.bestStreak)],[t("Duration","Thời gian"),`${(result.durationTicks/60).toFixed(1)}s`]]);
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
      celebrating = cityActive && renderer.hasPopulationEffect();
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
        const actions = hostPaused ? [] : [button(t("Resume", "Tiếp tục"), () => { userPaused = false; syncPause(); }), ...(replay ? [button(t("Restart replay", "Phát lại từ đầu"), () => startReplay(replay!.record))] : []), button(cityActive ? t("City map", "Bản đồ thành phố") : t("Home", "Trang đầu"), cityActive ? cityMap : home)];
        showPanel(t("Paused", "Tạm dừng"), t("Your game clock is stopped.", "Đồng hồ game đã dừng."), actions);
      }
    } else {
      if ((run || replay) && (current().phase !== "ended" || celebrating)) { panel.hidden = true; arena.focus(); }
      lastTime = 0; schedule();
    }
    pauseButton.textContent = userPaused ? t("Resume", "Tiếp tục") : t("Pause", "Tạm dừng");
  }
  function drop(): void {
    if (!ready || panel.hidden === false || hostPaused || userPaused || replay) return;
    if (run?.drop(run.getInterpolationAlpha())) checkpointCity();
  }
  function checkpointCity(): void {
    if (!cityActive || !run || !save.city.pending) return;
    save.city = updateCityCheckpoint(save.city, run); persist();
  }
  function className(id: BuildingId): string {
    return ({ residential: t("Residential", "Nhà ở"), industrial: t("Industrial", "Công nghiệp"), office: t("Office", "Văn phòng"), highrise: t("High-rise", "Cao tầng") })[id];
  }
  let guideBack: () => void = home;
  function showGuide(page:number, back:()=>void): void {
    guidePage=page;guideBack=back;
    const guide=cityGuide(vi), actions:HTMLButtonElement[]=[];
    if(page>0)actions.push(button(t("Previous", "Trước"),()=>showGuide(page-1,back)));
    if(page<guide.pages.length-1)actions.push(button(t("Next", "Tiếp"),()=>showGuide(page+1,back)));
    actions.push(button(t("Back", "Quay lại"),()=>{guidePage=-1;back();}));
    showPanel(`${guide.title} · ${page+1}/${guide.pages.length}`,guide.pages[page],actions);
    panel.classList.add("cb-guide-panel");
    const content=document.createElement("section"),heading=document.createElement("h3"),list=document.createElement("ul");
    content.className="cb-guide-content";heading.textContent=guide.sections[page].heading;
    for(const item of guide.sections[page].items) { const li=document.createElement("li");li.textContent=item;list.append(li); }
    content.append(heading,list);panel.querySelector("p")!.replaceWith(content);
  }
  function cityMap(): void {
    mapView=true;
    checkpointCity(); cancelFrame(); run = null; replay = null; cityActive = false; userPaused = false; paint();
    const city = save.city, status = placementStatus(city, selectedLot, selectedClass), old = city.lots[selectedLot];
    const summary = `${cityPopulation(city)} ${t("city population", "dân số thành phố")} · ${city.lots.filter(Boolean).length}/25 ${t("lots", "ô đất")}\n${t("Select a lot and class. Green highlights legal locations.", "Chọn ô và loại nhà. Màu xanh đánh dấu vị trí hợp lệ.")}`;
    const actions: HTMLButtonElement[] = [];
    if (city.pending) {
      actions.push(button(t("Resume tower", "Tiếp tục nhà đang xây"), () => { void resumeCity(); }), button(t("Cancel pending tower", "Hủy nhà đang xây"), () => {
        showPanel(t("Cancel construction?", "Hủy công trình?"), t("The old building, if any, will be kept. Pending progress will be discarded.", "Nhà cũ vẫn được giữ. Tiến trình công trình mới sẽ bị bỏ."), [button(t("Confirm cancel", "Xác nhận hủy"), () => { save.city = cancelCityTower(save.city); persist(); cityMap(); }), button(t("Back", "Quay lại"), cityMap)]);
      }));
    } else {
      const build = button(old ? t("Rebuild selected lot", "Xây lại ô đã chọn") : t("Build selected lot", "Xây ô đã chọn"), () => { void beginSelectedCity(); });
      build.disabled = !status.valid || loadingCity; actions.push(build);
      if (old) actions.push(button(t("Demolish", "Phá nhà"), () => {
        showPanel(t("Demolish building?", "Phá tòa nhà?"), `${t("Population change", "Thay đổi dân số")}: -${old.population}.\n${t("Existing neighbors and unlocked classes stay intact.", "Nhà lân cận và loại nhà đã mở khóa vẫn được giữ.")}`, [button(t("Confirm demolition", "Xác nhận phá"), () => { save.city = demolishCityBuilding(save.city, selectedLot); persist(); cityMap(); }), button(t("Back", "Quay lại"), cityMap)]);
      }));
    }
    actions.push(button(t("Home", "Trang đầu"), home), button(t("Retry save", "Lưu lại"), persist));
    actions.push(button(t("Guide", "Hướng dẫn"), () => showGuide(0,cityMap)));
    showPanel(t("Build City · Downtown", "Xây thành phố · Trung tâm"), summary, actions);
    panel.classList.add("cb-city-panel");
    const classes = document.createElement("div"); classes.className = "cb-city-classes";
    for (const id of BUILDING_IDS) {
      const b = button(`${className(id)} · ${BUILDINGS[id].floors}${city.unlocked.includes(id) ? "" : " 🔒"}`, () => { selectedClass = id; cityMap(); });
      b.dataset.class = id; b.style.borderColor = BUILDINGS[id].color; b.setAttribute("aria-pressed", String(id === selectedClass)); classes.append(b);
    }
    const grid = document.createElement("div"); grid.className = "cb-city-grid"; grid.setAttribute("role", "group"); grid.setAttribute("aria-label", t("Downtown 5 by 5 lots", "Trung tâm: 5 hàng, 5 cột ô đất"));
    grid.style.backgroundImage = `url('${options.assets}/bg/default/bg_downtown_default_map.png')`;
    for (let index = 0; index < 25; index++) {
      const lot = city.lots[index], valid = placementStatus(city, index, selectedClass).valid;
      const b = button("", () => { selectedLot = index; cityMap(); });
      b.dataset.lot = String(index); b.dataset.valid = String(valid); b.setAttribute("aria-pressed", String(index === selectedLot));
      const lotStatus = placementStatus(city, index, selectedClass);
      b.title = `(${Math.floor(index / 5) + 1},${index % 5 + 1}) · ${lotStatus.locked ? t("Locked: complete and accept the previous tier.", "Chưa mở khóa: hoàn thành và nhận nhà cấp trước.") : lotStatus.missing.length ? `${t("Needs edge-adjacent", "Cần kề cạnh")}: ${lotStatus.missing.map(className).join(" + ")}` : t("Click to select this valid lot", "Click để chọn ô hợp lệ này")}`;
      b.setAttribute("aria-label", `${t("Lot", "Ô")} ${index + 1}: ${lot ? `${className(lot.classId)}, ${lot.floors} ${t("floors", "tầng")}, ${lot.population} ${t("people", "dân")}` : t("empty", "trống")}`);
      if (lot) {
        const image = document.createElement("img"); image.src = `${options.assets}/city/default/city_${lot.classId}_default_mini.png`; image.alt = ""; image.draggable = false;
        image.addEventListener("error", () => { image.remove(); b.style.backgroundColor = BUILDINGS[lot.classId].color; }, { once: true }); b.append(image);
      }
      const label = document.createElement("span"); label.textContent = lot ? `${lot.floors}${lot.roof ? " ▲" : ""}` : String(index + 1); b.append(label); grid.append(b);
    }
    const detail = document.createElement("p"); detail.className = "cb-city-detail";
    detail.textContent = `${t("Lot", "Ô")} ${selectedLot + 1} · ${className(selectedClass)}\n${old ? `${t("Current", "Hiện tại")}: ${old.population} ${t("people", "dân")} · ${old.rating}\n` : ""}${status.locked ? t("Locked: complete and accept the previous tier first.", "Chưa mở khóa: hoàn thành và nhận nhà cấp trước.") : status.missing.length ? `${t("Needs adjacent", "Cần kề")}: ${status.missing.map(className).join(" + ")}` : t("Valid placement. Only four-direction neighbors count.", "Vị trí hợp lệ. Chỉ tính bốn ô liền cạnh.")}`;
    detail.textContent += ` · (${Math.floor(selectedLot / 5) + 1},${selectedLot % 5 + 1})`;
    detail.title = t("Click/tap selects a lot; hovering only previews its tooltip. Diagonals do not count.", "Click/chạm để chọn ô; hover chỉ xem gợi ý. Không tính ô chéo.");
    if (!status.locked && !city.lots.some((lot, index) => !lot && placementStatus(city, index, selectedClass).valid)) {
      detail.textContent += `\n${t("No valid empty lot. Add a supporting neighbor.", "Không có ô trống hợp lệ. Xây thêm nhà hỗ trợ liền cạnh.")}`;
    }
    panel.insertBefore(classes, panel.querySelector(".cb-actions")); panel.insertBefore(grid, panel.querySelector(".cb-actions")); panel.insertBefore(detail, panel.querySelector(".cb-actions"));
    hint.textContent = t("Complete a tier to unlock the next. A roof is a separate drop.", "Hoàn thành một cấp để mở cấp tiếp. Mái là một lần thả riêng.");
    el("[data-population]").textContent = String(cityPopulation(city));
    el("[data-floors]").textContent = String(city.lots.reduce((sum,lot)=>sum+(lot?.floors??0),0));
    el(".cb-toolbar strong").textContent = cityName();
    el("[data-mode]").textContent = t("Downtown","Trung tâm");
  }
  async function beginSelectedCity(): Promise<void> {
    if (loadingCity || save.city.pending || !placementStatus(save.city, selectedLot, selectedClass).valid) return;
    loadingCity = true;
    const lot = selectedLot, id = selectedClass;
    showPanel(t("Preparing construction", "Chuẩn bị xây"), t("Loading building artwork…", "Đang tải ảnh nhà…"), []);
    try { await renderer.loadBuilding(id); } catch { message(t("Building art unavailable; using colored fallback.", "Chưa tải được ảnh nhà; dùng hình màu dự phòng.")); }
    loadingCity = false; if (disposed) return;
    save.city = beginCityTower(save.city, lot, id, options.seed()); persist();
    await resumeCity();
  }
  async function resumeCity(): Promise<void> {
    const pending = save.city.pending; if (!pending || loadingCity) return;
    loadingCity = true;
    try { await renderer.loadBuilding(pending.classId); } catch { message(t("Using fallback building art.", "Đang dùng hình nhà dự phòng.")); }
    loadingCity = false; if (disposed || save.city.pending?.runId !== pending.runId) return;
    cancelFrame(); run = restoreTower(pending.checkpoint); replay = null; cityActive = true;
    renderer.resetEffects(run.getSnapshot().feedbackId); celebrating=false;
    userPaused = false; lastFeedback = run.getSnapshot().feedbackId; panel.hidden = true;
    pauseButton.textContent = t("Pause", "Tạm dừng"); paint();
    if (run.getPhase() === "ended") cityResults(); else { syncPause(); schedule(); arena.focus(); }
  }
  function cityResults(): void {
    checkpointCity();
    const pending = save.city.pending; if (!pending || !run) return;
    const result = run.getResult(), s = run.getSnapshot(), old = save.city.lots[pending.lot];
    const complete = result.height === BUILDINGS[pending.classId].floors;
    const body = `${className(pending.classId)}\n${s.roof ? t("Roof placed", "Đã đặt mái") : complete ? t("Body complete, roof missed", "Thân nhà hoàn thành, trượt mái") : t("Unfinished tower · no completion unlock", "Nhà dở · không nhận mở khóa")}\n${old ? `${t("Old building stays until you accept", "Nhà cũ giữ đến khi nhận kết quả")}: ${old.population}` : ""}`;
    const actions = [button(result.height ? t("Accept building", "Nhận tòa nhà") : t("Return to city", "Về thành phố"), () => {
      save.city = acceptCityTower(save.city, pending.runId); cityActive = false; persist(); cityMap();
    }), button(old ? t("Keep old building", "Giữ nhà cũ") : t("Discard tower", "Bỏ tòa nhà"), () => { save.city = cancelCityTower(save.city); cityActive = false; persist(); cityMap(); }), button(t("Retry save", "Lưu lại"), persist)];
    showPanel(`${t("City tower complete", "Kết quả nhà thành phố")} · ${result.rating}`, body, actions);
    showStats([[t("Population","Dân số"),String(result.population)],[t("Floors","Tầng"),`${result.height}/${BUILDINGS[pending.classId].floors}`],
      [t("Accuracy","Độ chính xác"),`${result.accuracy.toFixed(1)}%`],[t("Perfect","Hoàn hảo"),String(result.perfectCount)],
      [t("Best streak","Chuỗi tốt nhất"),String(result.bestStreak)],[t("Duration","Thời gian"),`${(result.durationTicks/60).toFixed(1)}s`]]);paint();
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
    // Pause and Paused share a Vietnamese translation; restore controls from state, not reverse text.
    pauseButton.textContent=userPaused?t("Resume","Tiếp tục"):t("Pause","Tạm dừng");
    el("[data-sound]").textContent=muted?t("Sound off","Tắt tiếng"):t("Sound on","Bật tiếng");
    el("[data-motion]").textContent=t("Reduced motion","Giảm chuyển động");
    const languageButton=root.querySelector("[data-language]");if(languageButton)languageButton.textContent=vi?"EN":"VI";
    if(guidePage>=0)showGuide(guidePage,guideBack);else if(run||replay)paint();else if(panel.classList.contains("cb-city-panel"))cityMap();
  }
  const languageButton=root.querySelector("[data-language]");
  if(languageButton)listen(languageButton,"click",()=>{const locale=vi?"en":"vi";setLocale(locale);options.onLocaleChange?.(locale);});
  listen(window, "pagehide", checkpointCity);
  listen(el("[data-sound]"), "click", () => {
    muted = !muted; if (muted) options.audio.suspend();
    el("[data-sound]").textContent = muted ? t("Sound off", "Tắt tiếng") : t("Sound on", "Bật tiếng");
    el("[data-sound]").setAttribute("aria-pressed", String(muted));
  });
  listen(el("[data-motion]"), "click", () => { reducedMotion = !reducedMotion; el("[data-motion]").setAttribute("aria-pressed", String(reducedMotion)); });
  if (options.lifecycle) {
    cleanups.push(options.lifecycle.onPause(() => { hostPaused = true; syncPause(); }), options.lifecycle.onResume(() => { hostPaused = false; syncPause(); }));
  } else listen(document, "visibilitychange", () => { hostPaused = document.hidden; syncPause(); });
  const observer = new ResizeObserver(() => { renderer.resize(arena.clientWidth, arena.clientHeight); paint(); });
  observer.observe(arena); cleanups.push(() => observer.disconnect());
  const readyPromise = (async () => {
    const load = renderer.load().catch(() => message(t("Some artwork could not load; playing with fallback graphics.", "Một số ảnh chưa tải được; game dùng hình dự phòng.")));
    let loadTimer: number | undefined;
    try {
      save = await Promise.race([
        options.save.load(),
        new Promise<GameSave>((_, reject) => { loadTimer = window.setTimeout(() => reject(new Error("Save load timeout")), 5000); }),
      ]);
    }
    catch { storageWritable = false; message(t("Save could not be read. Playing without saving to protect your old progress.", "Không đọc được save. Phiên này không ghi đè tiến trình cũ.")); }
    finally { window.clearTimeout(loadTimer); }
    await load;
    if (disposed) return;
    ready = true; renderer.resize(arena.clientWidth, arena.clientHeight); home();
  })();
  return { ready: readyPromise, setLocale, dispose() {
    checkpointCity();
    disposed = true; cancelFrame(); abort.abort(); cleanups.forEach(fn => fn());
    options.audio.dispose(); root.replaceChildren();
  } };
}
