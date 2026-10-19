import { ACHIEVEMENT_CATALOG, PROGRESSION_RULES } from "../../city-bloxx-content/progression";
import { COSMETIC_CATALOG } from "../../city-bloxx-content/cosmetics";
import {
  achievementProgress,
  BUNDLED_LIVEOPS_MANIFEST,
  BUILDING_IDS,
  eventGoalProgress,
  levelProgress,
  resolveWindowState,
  utcDate,
  utcWeekStart,
  weeklyCountdown,
  type BuildingId,
  type GameSave,
  type LiveOpsManifest,
  type RunSummary,
} from "../../city-bloxx-core/src/index";

export type RewardSaveStatus = "idle" | "pending" | "saved" | "error";
export type MissionSectionTab = "daily" | "weekly" | "event" | "season";

interface Options {
  panel: HTMLElement;
  save(): GameSave;
  now(): number;
  locale(): "en" | "vi";
  className(id: BuildingId): string;
  showPanel(title: string, body: string, actions: HTMLButtonElement[]): void;
  button(label: string, action: () => void): HTMLButtonElement;
  home(): void;
  claim(date: string, id: string): void;
  reroll(date: string, id: string): void;
  claimWeekly?(weekStartUTC: string, id: string): void;
  claimEventGoal?(goalId: string): void;
  claimSeasonTier?(tier: number): void;
  liveOpsManifest?(): LiveOpsManifest;
  retry(): void;
  status(): RewardSaveStatus;
  paused(): boolean;
  reducedMotion(): boolean;
}

export function createProgressionScreens(o: Options) {
  let refresh: (() => void) | null = null,
    timer = 0,
    earned = 0,
    animatedId = "",
    shownStatus: RewardSaveStatus = "idle",
    shownDate = "";
  let lastPage = 0,
    lastAchievement = 0,
    lastClass: BuildingId = "residential",
    lastMissionDate: string | null = null,
    lastMissionTab: MissionSectionTab = "daily",
    lastSeasonPage = 0;
  const t = (en: string, vi: string) => (o.locale() === "vi" ? vi : en);
  const number = (n: number) => n.toLocaleString(o.locale());
  const getManifest = () => o.liveOpsManifest?.() ?? BUNDLED_LIVEOPS_MANIFEST;

  function clear() {
    window.clearInterval(timer);
    timer = 0;
    refresh = null;
    o.panel.classList.remove("cb-progression-panel");
  }
  function show(title: string, body: string, actions: HTMLButtonElement[]) {
    o.showPanel(title, body, actions);
    o.panel.classList.add("cb-progression-panel");
  }
  function content() {
    const box = document.createElement("div");
    box.className = "cb-progression-content";
    o.panel.querySelector(".cb-actions")!.before(box);
    return box;
  }
  function bar(box: HTMLElement, label: string, xp: number, cap: number) {
    const level = levelProgress(xp, cap),
      row = document.createElement("div"),
      name = document.createElement("span"),
      progress = document.createElement("progress");
    name.textContent = `${label} · ${t("Level", "Cấp")} ${level.level}/${cap} · ${number(xp)} XP`;
    progress.max = 1;
    progress.value = level.progress;
    progress.setAttribute("aria-label", name.textContent);
    const detail = document.createElement("small");
    detail.textContent =
      level.next === null ? t("Maximum level", "Cấp tối đa") : `${number(level.remaining)} XP ${t("to next level", "đến cấp kế tiếp")}`;
    row.append(name, progress, detail);
    box.append(row);
  }
  function saveStatus() {
    const status = document.createElement("small");
    status.dataset.rewardSave = "";
    const state = o.status();
    shownStatus = state;
    shownDate = utcDate(o.now());
    status.textContent =
      state === "pending"
        ? t("Saving reward…", "Đang lưu thưởng…")
        : state === "error"
          ? t("Save failed. Reward kept in this session. Retry save.", "Lưu lỗi. Thưởng vẫn giữ trong phiên này. Thử lưu lại.")
          : state === "saved"
            ? t("Saved on this device / game host", "Đã lưu trên thiết bị / nền tảng game")
            : t("Rewards are local to this game", "Thưởng thuộc bản game này");
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

  function renderMissionTabBar(box: HTMLElement, activeTab: MissionSectionTab, onSwitch: (tab: MissionSectionTab) => void, wantedDate: string, onDateChange: (date: string) => void) {
    const row = document.createElement("nav");
    row.className = "cb-mission-bar";
    row.style.display = "flex";
    row.style.gap = "4px";
    row.style.alignItems = "center";
    row.style.justifyContent = "space-between";
    row.style.gridColumn = "1 / -1";
    row.style.minWidth = "0";

    const tabSelect = document.createElement("select");
    tabSelect.className = "cb-data-select";
    tabSelect.style.flex = "1 1 0";
    tabSelect.style.minWidth = "0";
    tabSelect.style.margin = "0";
    tabSelect.dataset.missionTab = activeTab;
    tabSelect.setAttribute("aria-label", t("Mission & LiveOps section", "Mục nhiệm vụ & sự kiện"));
    const tabs: [MissionSectionTab, string][] = [
      ["daily", t("Daily Missions", "Nhiệm vụ ngày")],
      ["weekly", t("Weekly Contracts", "Hợp đồng tuần")],
      ["event", t("Winter Event", "Sự kiện Mùa đông")],
      ["season", t("Free Season", "Mùa giải Miễn phí")],
    ];
    for (const [val, label] of tabs) {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = label;
      tabSelect.append(opt);
    }
    tabSelect.value = activeTab;
    tabSelect.onchange = () => {
      lastMissionTab = tabSelect.value as MissionSectionTab;
      onSwitch(lastMissionTab);
    };
    row.append(tabSelect);

    if (activeTab === "daily") {
      const p = o.save().progression,
        day = p.missionDays.find(d => d.dateUTC === wantedDate) ?? p.missionDays[0];
      if (day) {
        const select = document.createElement("select");
        select.className = "cb-data-select";
        select.style.flex = "1 1 0";
        select.style.minWidth = "0";
        select.style.margin = "0";
        select.setAttribute("aria-label", t("Mission UTC day", "Ngày UTC nhiệm vụ"));
        for (const d of p.missionDays) {
          const option = document.createElement("option");
          option.value = d.dateUTC;
          option.textContent = `${d.dateUTC} UTC`;
          select.append(option);
        }
        select.value = day.dateUTC;
        select.onchange = () => onDateChange(select.value);
        row.append(select);
      }
    } else if (activeTab === "weekly") {
      const weeks = o.save().liveOps?.weekly?.weeks ?? [];
      const currentWeek = weeks.find(w => w.weekStartUTC === wantedDate) ?? weeks[0];
      if (currentWeek) {
        const select = document.createElement("select");
        select.className = "cb-data-select";
        select.style.flex = "1 1 0";
        select.style.minWidth = "0";
        select.style.margin = "0";
        select.dataset.weeklySelect = "";
        select.setAttribute("aria-label", t("Weekly UTC Monday", "Thứ Hai UTC của tuần"));
        for (const w of weeks) {
          const option = document.createElement("option");
          option.value = w.weekStartUTC;
          option.textContent = `${w.weekStartUTC} (${t("Mon", "T2")})`;
          select.append(option);
        }
        select.value = currentWeek.weekStartUTC;
        select.onchange = () => onDateChange(select.value);
        row.append(select);
      }
    } else if (activeTab === "season") {
      const seasonState = o.save().liveOps?.freeSeason;
      const spBadge = document.createElement("small");
      spBadge.dataset.seasonSp = String(seasonState?.sp ?? 0);
      const tierReached = Math.floor((seasonState?.sp ?? 0) / 100);
      spBadge.textContent = `${seasonState?.sp ?? 0}/2000 SP · ${t("Tier", "Bậc")} ${tierReached}/20`;
      row.append(spBadge);
    } else if (activeTab === "event") {
      const manifest = getManifest();
      const wState = resolveWindowState(manifest.winterEvent, manifest.killSwitch.eventsDisabled, o.now());
      const badge = document.createElement("small");
      badge.dataset.eventWindowState = wState;
      badge.textContent = `${manifest.winterEvent.startsAtUTC.slice(0, 10)} → ${manifest.winterEvent.endsAtUTC.slice(0, 10)} (${wState})`;
      row.append(badge);
    }

    box.append(row);
  }

  function missions(box: HTMLElement, wanted: string, redraw: (date: string) => void) {
    renderMissionTabBar(
      box,
      lastMissionTab,
      () => redraw(wanted),
      wanted,
      nextDate => redraw(nextDate),
    );

    if (lastMissionTab === "weekly") {
      const manifest = getManifest();
      if (manifest.killSwitch.weeklyDisabled) {
        box.append(Object.assign(document.createElement("small"), { textContent: t("Weekly Contracts are temporarily paused.", "Hợp đồng tuần đang tạm dừng.") }));
        return;
      }
      const weeks = o.save().liveOps?.weekly?.weeks ?? [];
      const week = weeks.find(w => w.weekStartUTC === wanted) ?? weeks[0];
      if (!week) {
        box.append(Object.assign(document.createElement("small"), { textContent: t("No weekly contracts available", "Chưa có hợp đồng tuần") }));
        return;
      }
      const hoursLeft = Math.max(1, Math.ceil(weeklyCountdown(o.now()) / 3600));
      for (const s of week.slots) {
        const card = document.createElement("article"),
          title = document.createElement("strong"),
          detail = document.createElement("small");
        card.dataset.weeklyId = s.definition.id;
        title.textContent = s.definition.title[o.locale()];
        const stateLabel = {
          active: t("In progress", "Đang làm"),
          ready: t("Ready to claim", "Có thể nhận"),
          claimed: t("Claimed", "Đã nhận"),
        }[s.status];
        detail.textContent = `${s.progress}/${s.definition.target} · ${s.definition.xp} XP + 50 SP · ${stateLabel} · ${hoursLeft}h`;
        card.append(title, detail);
        if (s.status === "ready") {
          const b = o.button(t("Claim", "Nhận"), () => {
            o.claimWeekly?.(week.weekStartUTC, s.definition.id);
            redraw(week.weekStartUTC);
          });
          b.disabled = o.status() === "pending";
          b.dataset.weeklyClaim = s.definition.id;
          card.append(b);
        }
        box.append(card);
      }
      return;
    }

    if (lastMissionTab === "event") {
      const manifest = getManifest();
      const evState = o.save().liveOps?.winterEvent;
      const wState = resolveWindowState(manifest.winterEvent, manifest.killSwitch.eventsDisabled, o.now());
      for (const goal of manifest.winterEvent.goals) {
        const card = document.createElement("article"),
          title = document.createElement("strong"),
          detail = document.createElement("small");
        card.dataset.eventGoalId = goal.id;
        const progress = evState ? eventGoalProgress(evState, goal) : 0;
        const claimed = !!evState?.claimedGoals.includes(goal.id);
        const ready = !claimed && progress >= goal.target && (wState === "active" || wState === "run-grace" || wState === "claim-grace");
        const rewardItem = COSMETIC_CATALOG.find(c => c.id === goal.rewardCosmeticId);
        const rewardName = rewardItem ? rewardItem.title[o.locale()] : goal.rewardCosmeticId;
        title.textContent = goal.title[o.locale()];
        detail.textContent = `${progress}/${goal.target} · +${goal.xp} XP · ${rewardName} · ${claimed ? t("Claimed", "Đã nhận") : ready ? t("Ready", "Có thể nhận") : t("In progress", "Đang làm")}`;
        card.append(title, detail);
        if (ready) {
          const b = o.button(t("Claim", "Nhận"), () => {
            o.claimEventGoal?.(goal.id);
            redraw(wanted);
          });
          b.disabled = o.status() === "pending";
          b.dataset.eventClaim = goal.id;
          card.append(b);
        }
        box.append(card);
      }
      return;
    }

    if (lastMissionTab === "season") {
      const manifest = getManifest();
      const seState = o.save().liveOps?.freeSeason;
      const wState = resolveWindowState(manifest.freeSeason, manifest.killSwitch.seasonDisabled, o.now());
      const tiers = manifest.freeSeason.tiers;
      const pageCount = Math.ceil(tiers.length / 2);
      lastSeasonPage = Math.max(0, Math.min(pageCount - 1, lastSeasonPage));
      for (const tier of tiers.slice(lastSeasonPage * 2, lastSeasonPage * 2 + 2)) {
        const card = document.createElement("article"),
          title = document.createElement("strong"),
          detail = document.createElement("small");
        card.dataset.seasonTier = String(tier.tier);
        const claimed = !!seState?.claimedTiers.includes(tier.tier);
        const unlocked = (seState?.sp ?? 0) >= tier.spRequired;
        const canClaim = !claimed && unlocked && (wState === "active" || wState === "run-grace" || wState === "claim-grace");
        title.textContent = tier.title[o.locale()];
        detail.textContent = `${tier.spRequired} SP · ${claimed ? t("Claimed", "Đã nhận") : unlocked ? t("Unlocked", "Đã mở") : t("Locked", "Chưa mở")}`;
        card.append(title, detail);
        if (canClaim) {
          const b = o.button(t("Claim", "Nhận"), () => {
            o.claimSeasonTier?.(tier.tier);
            redraw(wanted);
          });
          b.disabled = o.status() === "pending";
          b.dataset.seasonClaim = String(tier.tier);
          card.append(b);
        }
        box.append(card);
      }
      const pager = document.createElement("div");
      pager.className = "cb-actions";
      if (lastSeasonPage > 0) {
        pager.append(
          o.button(t("Earlier tiers", "Bậc trước"), () => {
            lastSeasonPage--;
            redraw(wanted);
          }),
        );
      }
      const pageLabel = document.createElement("small");
      pageLabel.textContent = `${lastSeasonPage + 1}/${pageCount}`;
      pager.append(pageLabel);
      if (lastSeasonPage < pageCount - 1) {
        pager.append(
          o.button(t("More tiers", "Thêm bậc"), () => {
            lastSeasonPage++;
            redraw(wanted);
          }),
        );
      }
      box.append(pager);
      return;
    }

    const p = o.save().progression,
      day = p.missionDays.find(d => d.dateUTC === wanted) ?? p.missionDays[0];
    if (!day) {
      box.append(Object.assign(document.createElement("small"), { textContent: t("No missions available", "Chưa có nhiệm vụ") }));
      return;
    }
    for (const s of day.slots) {
      const card = document.createElement("article"),
        title = document.createElement("strong"),
        detail = document.createElement("small");
      card.dataset.missionId = s.definition.id;
      title.textContent = s.definition.title[o.locale()];
      const difficulty = { easy: t("Easy", "Dễ"), medium: t("Medium", "Vừa"), hard: t("Hard", "Khó") }[s.definition.difficulty];
      const state = {
        active: t("In progress", "Đang làm"),
        ready: t("Ready to claim", "Có thể nhận"),
        claimed: t("Claimed", "Đã nhận"),
        expired: t("Expired", "Hết hạn"),
      }[s.status];
      detail.textContent = `${difficulty} · ${s.progress}/${s.definition.target} · ${s.definition.xp} XP · ${state}${s.definition.nonAssist ? t(" · Non-Assist", " · Không Trợ giúp") : ""}`;
      card.append(title, detail);
      if (s.status === "ready") {
        const b = o.button(t("Claim", "Nhận"), () => {
          o.claim(day.dateUTC, s.definition.id);
          redraw(day.dateUTC);
        });
        b.disabled = o.status() === "pending";
        b.dataset.missionClaim = "";
        card.append(b);
      } else if (s.status === "active" && s.progress === 0 && !day.rerolled && day.dateUTC === utcDate(o.now())) {
        const b = o.button(t("Reroll", "Đổi"), () => {
          o.reroll(day.dateUTC, s.definition.id);
          redraw(day.dateUTC);
        });
        b.disabled = o.status() === "pending";
        b.dataset.missionReroll = "";
        card.append(b);
      }
      box.append(card);
    }
  }

  function menu(page = lastPage, missionDate = lastMissionDate ?? utcDate(o.now()), achievementPage = lastAchievement, masteryClass: BuildingId = lastClass) {
    lastPage = page;
    lastAchievement = achievementPage;
    lastClass = masteryClass;
    lastMissionDate = missionDate;
    const titles = [
      t("Builder", "Người xây"),
      t("Class mastery", "Thông thạo loại nhà"),
      t("Missions", "Nhiệm vụ"),
      t("Achievements", "Thành tựu"),
      t("XP guide", "Hướng dẫn XP"),
    ];
    const p = o.save().progression;
    const subtitle =
      page === 2
        ? lastMissionTab === "weekly"
          ? t("Weekly resets Monday 00:00 UTC. Claim within 7 days after week ends.", "Tuần mới lúc 00:00 UTC Thứ Hai. Nhận trong 7 ngày sau khi hết tuần.")
          : lastMissionTab === "event"
            ? t("Winter Frost Event (14 days). Earned cosmetics stay permanently in your inventory.", "Sự kiện Mùa đông (14 ngày). Trang bị đã nhận thuộc về bạn vĩnh viễn.")
            : lastMissionTab === "season"
              ? t("Free Season: +20 SP 1st Daily/day, +10 SP mission claim, +50 SP weekly claim.", "Mùa giải miễn phí: +20 SP Daily đầu/ngày, +10 SP nhiệm vụ ngày, +50 SP hợp đồng tuần.")
              : t("One free unstarted reroll/day. Claim within 7 UTC days including start day.", "Một lần đổi/ngày khi chưa làm. Nhận trong 7 ngày UTC kể cả ngày bắt đầu.")
        : "";
    show(`${t("Progression", "Tiến trình")} · ${titles[page]} · ${page + 1}/5`, subtitle, navigation(page, 5, n => menu(n), o.home));
    const box = content();
    if (page === 0) bar(box, t("Builder", "Người xây"), p.xp, PROGRESSION_RULES.builderCap);
    if (page === 1) {
      const select = document.createElement("select");
      select.className = "cb-data-select";
      select.dataset.masteryClass = "";
      select.setAttribute("aria-label", t("Mastery class", "Loại nhà thông thạo"));
      for (const id of BUILDING_IDS) {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = o.className(id);
        select.append(option);
      }
      select.value = masteryClass;
      select.onchange = () => menu(page, missionDate, achievementPage, select.value as BuildingId);
      box.append(select);
      bar(box, o.className(masteryClass), p.masteryXP[masteryClass], PROGRESSION_RULES.masteryCap);
    }
    if (page === 2) {
      const defaultDate = lastMissionTab === "weekly" ? utcWeekStart(missionDate) : missionDate;
      missions(box, defaultDate, date => menu(page, date, achievementPage, masteryClass));
    }
    if (page === 3) {
      for (const d of ACHIEVEMENT_CATALOG.slice(achievementPage * 3, achievementPage * 3 + 3)) {
        const card = document.createElement("article"),
          title = document.createElement("strong"),
          detail = document.createElement("small"),
          unlock = p.unlocks.find(u => u.id === d.id);
        title.textContent = `${p.achievements.includes(d.id) ? "★" : "☆"} ${d.title[o.locale()]}`;
        detail.textContent = `${achievementProgress(p, d)}/${d.target} · ${d.xp} XP${["perfect", "streak", "height"].includes(d.metric) ? t(" · Non-Assist", " · Không Trợ giúp") : ""} · ${p.achievements.includes(d.id) ? t("Unlocked", "Đã mở") : achievementProgress(p, d) ? t("In progress", "Đang làm") : t("Locked", "Chưa mở")}${unlock ? ` · ${utcDate(unlock.at)}` : ""}`;
        card.append(title, detail);
        box.append(card);
      }
      const pages = Math.ceil(ACHIEVEMENT_CATALOG.length / 3),
        pager = document.createElement("div");
      pager.className = "cb-actions";
      if (achievementPage > 0) pager.append(o.button(t("Earlier achievements", "Thành tựu trước"), () => menu(page, missionDate, achievementPage - 1)));
      const count = document.createElement("small");
      count.textContent = `${achievementPage + 1}/${pages}`;
      pager.append(count);
      if (achievementPage < pages - 1) pager.append(o.button(t("More achievements", "Thêm thành tựu"), () => menu(page, missionDate, achievementPage + 1)));
      box.append(pager);
    }
    if (page === 4) {
      box.textContent = t(
        "XP measures building progress; population is your run score. Builder level is not a competitive rank. Landed body +5, Perfect +2, completed finite body +50: these also raise that class's mastery. Daily first completion +50, mission rewards and achievements raise only builder XP. Replay gives no rewards. Missions follow the run's start UTC day. Expired claims are archived; earned XP stays yours.",
        "XP đo tiến trình xây dựng; dân số là điểm lượt chơi. Cấp người xây không phải hạng thi đấu. Tầng thân đáp +5, Hoàn hảo +2, thân tháp hữu hạn hoàn thành +50: cũng tăng thông thạo loại nhà đó. Daily hoàn thành đầu tiên +50, thưởng nhiệm vụ và thành tựu chỉ tăng XP người xây. Replay không có thưởng. Nhiệm vụ theo ngày UTC bắt đầu lượt. Yêu cầu nhận hết hạn được lưu trữ; XP đã nhận vẫn thuộc bạn.",
      );
    }
    saveStatus();
    refresh = () => menu(page, missionDate, achievementPage, masteryClass);
  }

  function result(summary: RunSummary, back: () => void, page = 0, missionDate = utcDate(summary.startedAt), unlockPage = 0) {
    const reward = o.save().history.find(h => h.identity.id === summary.identity.id) ?? summary,
      xp = reward.xpEarned ?? 0;
    if (animatedId !== reward.identity.id) {
      animatedId = reward.identity.id;
      earned = o.reducedMotion() ? xp : 0;
    }
    if (o.reducedMotion()) earned = xp;
    const titles = [t("XP earned", "XP nhận được"), t("Missions & Season", "Nhiệm vụ & Mùa giải"), t("Unlocks", "Mở khóa")];
    show(`${t("XP & missions", "XP và nhiệm vụ")} · ${titles[page]} · ${page + 1}/3`, "", navigation(page, 3, n => result(summary, back, n, missionDate), back));
    const box = content();
    if (page === 0) {
      const count = document.createElement("strong");
      count.dataset.xpCount = "";
      const update = () => {
        count.textContent = `+${number(earned)} XP`;
      };
      update();
      box.append(count);
      bar(box, t("Builder", "Người xây"), o.save().progression.xp, PROGRESSION_RULES.builderCap);
      bar(box, o.className(reward.building), o.save().progression.masteryXP[reward.building], PROGRESSION_RULES.masteryCap);
      const levels = levelProgress((reward.builderXPBefore ?? 0) + xp).level - levelProgress(reward.builderXPBefore ?? 0).level;
      const detail = document.createElement("small");
      detail.textContent = `${reward.baseXPEarned ?? xp} ${t("base XP", "XP xây dựng")} + ${reward.bonusXPEarned ?? 0} ${t("bonus XP", "XP thưởng")} · +${levels} ${t("builder levels", "cấp người xây")} · ${reward.unlockedAchievements?.length ?? 0} ${t("achievements unlocked", "thành tựu mở")}`;
      box.append(detail);
      detail.setAttribute("role", "status");
      detail.setAttribute("aria-live", "polite");
      detail.setAttribute("aria-atomic", "true");
      if (earned < xp) {
        const skip = o.button(t("Skip XP animation", "Bỏ qua hoạt ảnh XP"), () => {
          earned = xp;
          update();
          skip.remove();
          window.clearInterval(timer);
          timer = 0;
        });
        box.append(skip);
        timer = window.setInterval(() => {
          if (o.paused()) return;
          earned = o.reducedMotion() ? xp : Math.min(xp, earned + Math.max(1, Math.ceil(xp / 24)));
          update();
          if (earned === xp) {
            window.clearInterval(timer);
            timer = 0;
            skip.remove();
          }
        }, 40);
      }
    }
    if (page === 1) {
      const defaultDate = lastMissionTab === "weekly" ? utcWeekStart(missionDate) : missionDate;
      missions(box, defaultDate, date => result(summary, back, page, date, unlockPage));
    }
    if (page === 2) {
      const ids = [...(reward.unlockedAchievements ?? []), ...(reward.unlockedCosmetics ?? [])],
        pages = Math.max(1, Math.ceil(ids.length / 3));
      for (const id of ids.slice(unlockPage * 3, unlockPage * 3 + 3)) {
        const row = document.createElement("article");
        const d = ACHIEVEMENT_CATALOG.find(d => d.id === id),
          item = COSMETIC_CATALOG.find(d => d.id === id);
        row.textContent = `★ ${d?.title[o.locale()] ?? item?.title[o.locale()] ?? id}${d ? ` · +${d.xp} XP` : ` · ${t("Cosmetic unlocked", "Đã mở trang bị")}`}`;
        box.append(row);
      }
      if (!ids.length) box.textContent = t("No new achievements this run", "Lượt này chưa mở thêm thành tựu");
      if (unlockPage > 0) box.append(o.button(t("Earlier unlocks", "Mở khóa trước"), () => result(summary, back, page, missionDate, unlockPage - 1)));
      if (unlockPage < pages - 1) box.append(o.button(t("More unlocks", "Thêm mở khóa"), () => result(summary, back, page, missionDate, unlockPage + 1)));
    }
    saveStatus();
    refresh = () => result(summary, back, page, missionDate, unlockPage);
  }

  return {
    menu,
    result,
    clear,
    setTab(tab: MissionSectionTab) {
      lastMissionTab = tab;
    },
    isOpen: () => !!refresh,
    refresh: () => refresh?.(),
    tick: () => {
      if (refresh && (shownStatus !== o.status() || shownDate !== utcDate(o.now()))) refresh();
    },
  };
}
