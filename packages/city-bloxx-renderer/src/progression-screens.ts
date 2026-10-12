import { ACHIEVEMENT_CATALOG, PROGRESSION_RULES } from "../../city-bloxx-content/progression";
import { achievementProgress, BUILDING_IDS, levelProgress, utcDate, type BuildingId, type GameSave, type RunSummary } from "../../city-bloxx-core/src/index";

export type RewardSaveStatus = "idle" | "pending" | "saved" | "error";
interface Options {
  panel: HTMLElement; save(): GameSave; now(): number; locale(): "en" | "vi"; className(id: BuildingId): string;
  showPanel(title: string, body: string, actions: HTMLButtonElement[]): void; button(label: string, action: () => void): HTMLButtonElement;
  home(): void; claim(date: string, id: string): void; reroll(date: string, id: string): void; retry(): void;
  status(): RewardSaveStatus; paused(): boolean; reducedMotion(): boolean;
}
export function createProgressionScreens(o: Options) {
  let refresh: (() => void) | null = null, timer = 0, earned = 0, animatedId = "", shownStatus: RewardSaveStatus = "idle", shownDate = "";
  const t = (en: string, vi: string) => o.locale() === "vi" ? vi : en;
  const number = (n: number) => n.toLocaleString(o.locale());
  function clear() { window.clearInterval(timer); timer = 0; refresh = null; o.panel.classList.remove("cb-progression-panel"); }
  function show(title: string, body: string, actions: HTMLButtonElement[]) {
    o.showPanel(title, body, actions); o.panel.classList.add("cb-progression-panel");
  }
  function content() { const box = document.createElement("div"); box.className = "cb-progression-content"; o.panel.querySelector(".cb-actions")!.before(box); return box; }
  function bar(box: HTMLElement, label: string, xp: number, cap: number) {
    const level = levelProgress(xp, cap), row = document.createElement("div"), name = document.createElement("span"), progress = document.createElement("progress");
    name.textContent = `${label} · ${t("Level", "Cấp")} ${level.level}/${cap} · ${number(xp)} XP`;
    progress.max = 1; progress.value = level.progress; progress.setAttribute("aria-label", name.textContent);
    const detail = document.createElement("small"); detail.textContent = level.next === null ? t("Maximum level", "Cấp tối đa") : `${number(level.remaining)} XP ${t("to next level", "đến cấp kế tiếp")}`;
    row.append(name, progress, detail); box.append(row);
  }
  function saveStatus() {
    const status = document.createElement("small"); status.dataset.rewardSave = "";
    const state = o.status();
    shownStatus = state; shownDate = utcDate(o.now());
    status.textContent = state === "pending" ? t("Saving reward…", "Đang lưu thưởng…") : state === "error" ? t("Save failed. Reward kept in this session. Retry save.", "Lưu lỗi. Thưởng vẫn giữ trong phiên này. Thử lưu lại.") : state === "saved" ? t("Saved on this device / game host", "Đã lưu trên thiết bị / nền tảng game") : t("Rewards are local to this game", "Thưởng thuộc bản game này");
    o.panel.querySelector(".cb-actions")!.before(status);
  }
  function navigation(page: number, total: number, go: (page: number) => void, back: () => void) {
    const actions = [];
    if (page > 0) actions.push(o.button(t("Previous", "Trước"), () => go(page - 1)));
    if (page < total - 1) actions.push(o.button(t("Next", "Tiếp"), () => go(page + 1)));
    actions.push(o.button(t("Back", "Quay lại"), back));
    if (o.status() === "error") actions.push(o.button(t("Retry save", "Thử lưu lại"), o.retry));
    return actions;
  }
  function missions(box: HTMLElement, wanted: string, redraw: (date: string) => void) {
    const p = o.save().progression, day = p.missionDays.find(d => d.dateUTC === wanted) ?? p.missionDays[0];
    if (!day) { box.textContent = t("No missions available", "Chưa có nhiệm vụ"); return; }
    const select = document.createElement("select"); select.className = "cb-data-select"; select.setAttribute("aria-label", t("Mission UTC day", "Ngày UTC nhiệm vụ"));
    for (const d of p.missionDays) { const option = document.createElement("option"); option.value = d.dateUTC; option.textContent = `${d.dateUTC} UTC`; select.append(option); }
    select.value = day.dateUTC; select.onchange = () => redraw(select.value); box.append(select);
    for (const s of day.slots) {
      const card = document.createElement("article"), title = document.createElement("strong"), detail = document.createElement("small");
      card.dataset.missionId = s.definition.id; title.textContent = s.definition.title[o.locale()];
      const difficulty = ({ easy: t("Easy", "Dễ"), medium: t("Medium", "Vừa"), hard: t("Hard", "Khó") })[s.definition.difficulty];
      const state = ({ active: t("In progress", "Đang làm"), ready: t("Ready to claim", "Có thể nhận"), claimed: t("Claimed", "Đã nhận"), expired: t("Expired", "Hết hạn") })[s.status];
      detail.textContent = `${difficulty} · ${s.progress}/${s.definition.target} · ${s.definition.xp} XP · ${state}${s.definition.nonAssist ? t(" · Non-Assist", " · Không Trợ giúp") : ""}`;
      card.append(title, detail);
      if (s.status === "ready") { const b = o.button(t("Claim", "Nhận"), () => { o.claim(day.dateUTC, s.definition.id); redraw(day.dateUTC); }); b.disabled = o.status() === "pending"; b.dataset.missionClaim = ""; card.append(b); }
      else if (s.status === "active" && s.progress === 0 && !day.rerolled && day.dateUTC === utcDate(o.now())) { const b = o.button(t("Reroll", "Đổi"), () => { o.reroll(day.dateUTC, s.definition.id); redraw(day.dateUTC); }); b.disabled = o.status() === "pending"; b.dataset.missionReroll = ""; card.append(b); }
      box.append(card);
    }
  }
  function menu(page = 0, missionDate = utcDate(o.now()), achievementPage = 0, masteryClass: BuildingId = "residential") {
    const titles = [t("Builder", "Người xây"), t("Class mastery", "Thông thạo loại nhà"), t("Daily missions", "Nhiệm vụ hằng ngày"), t("Achievements", "Thành tựu"), t("XP guide", "Hướng dẫn XP")];
    const p = o.save().progression;
    show(`${t("Progression", "Tiến trình")} · ${titles[page]} · ${page + 1}/5`, page === 2 ? t("One free unstarted reroll/day. Claim within 7 UTC days including start day.", "Một lần đổi/ngày khi chưa làm. Nhận trong 7 ngày UTC kể cả ngày bắt đầu.") : "", navigation(page, 5, n => menu(n), o.home));
    const box = content();
    if (page === 0) bar(box, t("Builder", "Người xây"), p.xp, PROGRESSION_RULES.builderCap);
    if (page === 1) {
      const select = document.createElement("select"); select.className = "cb-data-select"; select.dataset.masteryClass = ""; select.setAttribute("aria-label", t("Mastery class", "Loại nhà thông thạo"));
      for (const id of BUILDING_IDS) { const option = document.createElement("option"); option.value = id; option.textContent = o.className(id); select.append(option); }
      select.value = masteryClass; select.onchange = () => menu(page, missionDate, achievementPage, select.value as BuildingId); box.append(select);
      bar(box, o.className(masteryClass), p.masteryXP[masteryClass], PROGRESSION_RULES.masteryCap);
    }
    if (page === 2) missions(box, missionDate, date => menu(page, date));
    if (page === 3) {
      for (const d of ACHIEVEMENT_CATALOG.slice(achievementPage * 3, achievementPage * 3 + 3)) {
        const card = document.createElement("article"), title = document.createElement("strong"), detail = document.createElement("small"), unlock = p.unlocks.find(u => u.id === d.id);
        title.textContent = `${p.achievements.includes(d.id) ? "★" : "☆"} ${d.title[o.locale()]}`;
        detail.textContent = `${achievementProgress(p, d)}/${d.target} · ${d.xp} XP${["perfect", "streak", "height"].includes(d.metric) ? t(" · Non-Assist", " · Không Trợ giúp") : ""} · ${p.achievements.includes(d.id) ? t("Unlocked", "Đã mở") : achievementProgress(p, d) ? t("In progress", "Đang làm") : t("Locked", "Chưa mở")}${unlock ? ` · ${utcDate(unlock.at)}` : ""}`;
        card.append(title, detail); box.append(card);
      }
      const pages = Math.ceil(ACHIEVEMENT_CATALOG.length / 3), pager = document.createElement("div"); pager.className = "cb-actions";
      if (achievementPage > 0) pager.append(o.button(t("Earlier achievements", "Thành tựu trước"), () => menu(page, missionDate, achievementPage - 1)));
      const count = document.createElement("small"); count.textContent = `${achievementPage + 1}/${pages}`; pager.append(count);
      if (achievementPage < pages - 1) pager.append(o.button(t("More achievements", "Thêm thành tựu"), () => menu(page, missionDate, achievementPage + 1)));
      box.append(pager);
    }
    if (page === 4) {
      box.textContent = t("XP measures building progress; population is your run score. Builder level is not a competitive rank. Landed body +5, Perfect +2, completed finite body +50: these also raise that class's mastery. Daily first completion +50, mission rewards and achievements raise only builder XP. Replay gives no rewards. Missions follow the run's start UTC day. Expired claims are archived; earned XP stays yours.", "XP đo tiến trình xây dựng; dân số là điểm lượt chơi. Cấp người xây không phải hạng thi đấu. Tầng thân đáp +5, Hoàn hảo +2, thân tháp hữu hạn hoàn thành +50: cũng tăng thông thạo loại nhà đó. Daily hoàn thành đầu tiên +50, thưởng nhiệm vụ và thành tựu chỉ tăng XP người xây. Replay không có thưởng. Nhiệm vụ theo ngày UTC bắt đầu lượt. Yêu cầu nhận hết hạn được lưu trữ; XP đã nhận vẫn thuộc bạn.");
    }
    saveStatus(); refresh = () => menu(page, missionDate, achievementPage, masteryClass);
  }
  function result(summary: RunSummary, back: () => void, page = 0, missionDate = utcDate(summary.startedAt), unlockPage = 0) {
    const reward = o.save().history.find(h => h.identity.id === summary.identity.id) ?? summary, xp = reward.xpEarned ?? 0;
    if (animatedId !== reward.identity.id) { animatedId = reward.identity.id; earned = o.reducedMotion() ? xp : 0; }
    if (o.reducedMotion()) earned = xp;
    const titles = [t("XP earned", "XP nhận được"), t("Daily missions", "Nhiệm vụ hằng ngày"), t("Unlocks", "Mở khóa")];
    show(`${t("XP & missions", "XP và nhiệm vụ")} · ${titles[page]} · ${page + 1}/3`, "", navigation(page, 3, n => result(summary, back, n, missionDate), back));
    const box = content();
    if (page === 0) {
      const count = document.createElement("strong"); count.dataset.xpCount = "";
      const update = () => { count.textContent = `+${number(earned)} XP`; }; update(); box.append(count);
      bar(box, t("Builder", "Người xây"), o.save().progression.xp, PROGRESSION_RULES.builderCap);
      bar(box, o.className(reward.building), o.save().progression.masteryXP[reward.building], PROGRESSION_RULES.masteryCap);
      const levels = levelProgress((reward.builderXPBefore ?? 0) + xp).level - levelProgress(reward.builderXPBefore ?? 0).level;
      const detail = document.createElement("small"); detail.textContent = `${reward.baseXPEarned ?? xp} ${t("base XP", "XP xây dựng")} + ${reward.bonusXPEarned ?? 0} ${t("bonus XP", "XP thưởng")} · +${levels} ${t("builder levels", "cấp người xây")} · ${reward.unlockedAchievements?.length ?? 0} ${t("achievements unlocked", "thành tựu mở")}`; box.append(detail);
      if (earned < xp) {
        const skip = o.button(t("Skip XP animation", "Bỏ qua hoạt ảnh XP"), () => { earned = xp; update(); skip.remove(); window.clearInterval(timer); timer = 0; }); box.append(skip);
        timer = window.setInterval(() => { if (o.paused()) return; earned = o.reducedMotion() ? xp : Math.min(xp, earned + Math.max(1, Math.ceil(xp / 24))); update(); if (earned === xp) { window.clearInterval(timer); timer = 0; skip.remove(); } }, 40);
      }
    }
    if (page === 1) missions(box, missionDate, date => result(summary, back, page, date));
    if (page === 2) {
      const ids = reward.unlockedAchievements ?? [], pages = Math.max(1, Math.ceil(ids.length / 3));
      for (const id of ids.slice(unlockPage * 3, unlockPage * 3 + 3)) { const row = document.createElement("article"); const d = ACHIEVEMENT_CATALOG.find(d => d.id === id); row.textContent = `★ ${d?.title[o.locale()] ?? id} · +${d?.xp ?? 0} XP`; box.append(row); }
      if (!ids.length) box.textContent = t("No new achievements this run", "Lượt này chưa mở thêm thành tựu");
      if (unlockPage > 0) box.append(o.button(t("Earlier unlocks", "Mở khóa trước"), () => result(summary, back, page, missionDate, unlockPage - 1)));
      if (unlockPage < pages - 1) box.append(o.button(t("More unlocks", "Thêm mở khóa"), () => result(summary, back, page, missionDate, unlockPage + 1)));
    }
    saveStatus(); refresh = () => result(summary, back, page, missionDate, unlockPage);
  }
  return { menu, result, clear, isOpen: () => !!refresh, refresh: () => refresh?.(), tick: () => { if (refresh && (shownStatus !== o.status() || shownDate !== utcDate(o.now()))) refresh(); } };
}
