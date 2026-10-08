import { BUILDING_IDS, cityPopulation, perfectRate, type BuildingId, type GameSave, type RunRecord, type RunSummary, type StatTotals, type StatsGroup } from "../../city-bloxx-core/src/index";

interface DataScreenOptions {
  panel: HTMLElement; save(): GameSave; t(en: string, vi: string): string; className(id: BuildingId): string;
  showPanel(title: string, body: string, actions: HTMLButtonElement[]): void;
  showStats(stats: [string, string][]): void; button(label: string, action: () => void): HTMLButtonElement;
  home(): void; replay(record: RunRecord): void; pin(id: string | null): void;
}
export function createDataScreens(o: DataScreenOptions) {
  const { t, button } = o;
  let refresh: (() => void) | null = null;
  const locale = () => o.panel.closest(".cb-game")?.getAttribute("lang") ?? "en";
  const number = (n: number) => n.toLocaleString(locale());
  const percent = (totals: StatTotals) => perfectRate(totals) === null ? t("No scored drops", "Chưa có lần thả được chấm") : `${perfectRate(totals)}%`;
  const date = (stamp: number) => stamp ? new Intl.DateTimeFormat(locale(), { dateStyle: "short", timeStyle: "short" }).format(stamp) : t("Time unavailable", "Không có thời điểm");
  const qualityName = (quality: string | null) => quality === null ? "—" : ({ perfect: t("Perfect", "Hoàn hảo"), great: t("Great", "Rất tốt"), good: t("Good", "Tốt"), risky: t("Risky", "Rủi ro"), miss: t("Miss", "Trượt") })[quality as "perfect"];
  const modeName = (s: RunSummary) => s.mode === "city" ? t("Build City", "Xây thành phố") : s.assist ? t("Assist", "Hỗ trợ") : t("Standard", "Tiêu chuẩn");
  const label = (page: number) => [t("Overview", "Tổng quan"), t("Skill", "Kỹ năng"), t("Class", "Loại nhà")][page];
  function selector<T extends string>(choices: [T, string][], selected: T, change: (value: T) => void): void {
    const select = document.createElement("select"); select.className = "cb-data-select";
    select.setAttribute("aria-label", t("Filter statistics and history", "Lọc thống kê và lịch sử"));
    for (const [value, name] of choices) { const option = document.createElement("option"); option.value = value; option.textContent = name; select.append(option); }
    select.value = selected; select.addEventListener("change", () => change(select.value as T));
    o.panel.querySelector("p")!.append(document.createElement("br"), select);
  }
  function statistics(page = 0, group: "all" | StatsGroup = "all", building: BuildingId = "residential"): void {
    const save = o.save(), totals = page === 2 ? save.stats.byClass[building] : group === "all" ? save.stats.totals : save.stats.byMode[group];
    const actions: HTMLButtonElement[] = [];
    if (page > 0) actions.push(button(t("Previous", "Trước"), () => statistics(page - 1, group, building)));
    if (page < 2) actions.push(button(t("Next", "Tiếp"), () => statistics(page + 1, group, building)));
    actions.push(button(t("History", "Lịch sử"), () => history()), button(t("Home", "Trang đầu"), o.home));
    o.showPanel(`${t("Statistics", "Thống kê")} · ${label(page)} · ${page + 1}/3`, `${t("Tracking since", "Theo dõi từ")}: ${date(save.stats.trackedSince)}\n${t("Older totals are not reconstructed.", "Không dựng lại thống kê chưa được lưu trước đây.")}`, actions);
    if (page === 2) selector(BUILDING_IDS.map(id => [id, o.className(id)]), building, next => statistics(page, group, next));
    else selector([["all", t("All tracked runs", "Tất cả lượt đã theo dõi")], ["quick-standard", t("Quick Standard", "Quick tiêu chuẩn")], ["quick-assist", t("Quick Assist", "Quick hỗ trợ")], ["city", t("Build City", "Xây thành phố")]], group, next => statistics(page, next, building));
    const quality = totals.quality;
    o.showStats(page === 1 ? [[t("Perfect rate", "Tỷ lệ Perfect"), percent(totals)], [t("Scored body drops", "Lần thả thân được chấm"), number(totals.scoredBody)],
      [t("Great / Good / Risky", "Great / Good / Risky"), `${quality.great} / ${quality.good} / ${quality.risky}`], [t("Body misses", "Trượt tầng thân"), number(quality.miss)],
      [t("Perfect roofs", "Mái Perfect"), number(totals.roof.perfect)], [t("Best combo / streak", "Combo / chuỗi tốt nhất"), `${totals.maxCombo} / ${totals.bestStreak}`]] :
      [[t("Tracked attempts", "Lượt đã theo dõi"), number(totals.attempts)], [t("Best height", "Chiều cao tốt nhất"), number(totals.bestHeight)],
      [t("Earned population", "Dân số kiếm được"), number(totals.population)], [t("Complete bodies", "Thân nhà hoàn thành"), number(totals.completed)],
      [page === 2 ? t("Accepted complete City builds", "Nhà City đủ thân đã nhận") : t("Accepted City builds", "Nhà City đã nhận"), number(page === 2 ? save.city.stats.byClass[building] : save.city.stats.builds)],
      [t("Current city population", "Dân số City hiện tại"), number(cityPopulation(save.city))]]);
    o.panel.classList.add("cb-data-panel"); refresh = () => statistics(page, group, building);
  }
  function history(page = 0, filter: "all" | StatsGroup = "all"): void {
    const rows = o.save().history.filter(s => filter === "all" || filter === "city" ? filter === "all" || s.mode === "city" : s.mode === "quick" && s.assist === (filter === "quick-assist"));
    const pages = Math.max(1, Math.ceil(rows.length / 3)); page = Math.max(0, Math.min(page, pages - 1));
    const actions: HTMLButtonElement[] = [];
    if (page > 0) actions.push(button(t("Previous", "Trước"), () => history(page - 1, filter)));
    if (page < pages - 1) actions.push(button(t("Next", "Tiếp"), () => history(page + 1, filter)));
    actions.push(button(t("Statistics", "Thống kê"), () => statistics()), button(t("Home", "Trang đầu"), o.home));
    o.showPanel(`${t("History", "Lịch sử")} · ${page + 1}/${pages}`, rows.length ? t("Up to 50 recent summaries; only retained Quick replays can be played.", "Tối đa 50 kết quả gần đây; chỉ phát lại lượt Quick còn được giữ.") : t("No tracked runs yet. Play a tower to add its result here.", "Chưa có lượt được lưu. Chơi một tháp để ghi kết quả tại đây."), actions);
    selector([["all", t("All modes", "Tất cả chế độ")], ["quick-standard", t("Quick Standard", "Quick tiêu chuẩn")], ["quick-assist", t("Quick Assist", "Quick hỗ trợ")], ["city", t("Build City", "Xây thành phố")]], filter, next => history(0, next));
    const list = document.createElement("div"); list.className = "cb-history-list";
    for (const s of rows.slice(page * 3, page * 3 + 3)) {
      const b = button(`${modeName(s)} · ${o.className(s.building)}\n${s.result.height} ${t("floors", "tầng")} · ${number(s.result.population)} ${t("people", "dân")} · ${s.outcome === "abandoned" ? t("Stopped", "Đã dừng") : s.result.rating}`, () => details(s.identity.id, () => history(page, filter)));
      b.dataset.historyId = s.identity.id; list.append(b);
    }
    o.panel.querySelector(".cb-actions")!.before(list); o.panel.classList.add("cb-data-panel", "cb-history-panel");
    refresh = () => history(page, filter);
  }
  function details(id: string, back: () => void, qualityPage = false): void {
    const save = o.save(), summary = save.history.find(h => h.identity.id === id); if (!summary) { history(); return; }
    const archive = save.replays.find(r => r.id === id), metrics = summary.metrics;
    const unavailable = summary.replayStatus === "unsupported" ? t("Replay version unsupported", "Phiên bản replay không còn hỗ trợ") : summary.replayStatus === "pruned" ? t("Replay was pruned; summary is kept", "Replay đã dọn; kết quả vẫn được giữ") : t("No replay recorded for this run", "Lượt này không có replay được lưu");
    const actions = [button(qualityPage ? t("Result", "Kết quả") : t("Drop quality", "Chất lượng thả"), () => details(id, back, !qualityPage))];
    if (archive) {
      actions.push(button(t("Replay", "Phát lại"), () => o.replay(archive.record)));
      actions.push(button(save.replayRefs.pinned === id ? t("Unpin replay", "Bỏ ghim replay") : t("Pin replay", "Ghim replay"), () => { o.pin(save.replayRefs.pinned === id ? null : id); details(id, back, qualityPage); }));
    }
    actions.push(button(t("Back", "Quay lại"), back));
    o.showPanel(`${modeName(summary)} · ${o.className(summary.building)}`, `${date(summary.endedAt)}\n${archive ? t("Personal result · not server verified", "Kết quả cá nhân · chưa xác minh server") : unavailable}`, actions);
    const r = summary.result;
    if (qualityPage && metrics) {
      const total = Object.values(metrics.body).reduce((sum, n) => sum + n, 0);
      o.showStats([[t("Perfect", "Hoàn hảo"), `${metrics.body.perfect} · ${total ? (metrics.body.perfect / total * 100).toFixed(1) : "—"}%`], [t("Great / Good", "Rất tốt / Tốt"), `${metrics.body.great} / ${metrics.body.good}`],
        [t("Risky / Miss", "Rủi ro / Trượt"), `${metrics.body.risky} / ${metrics.body.miss}`], [t("Foundation · unscored", "Móng · không chấm"), String(metrics.foundation)],
        [t("Roof", "Mái"), qualityName(metrics.roof)], [t("Signed error mean", "Lệch trung bình có dấu"), metrics.errorCount ? `${(metrics.signedErrorSum / metrics.errorCount * 100).toFixed(1)}%` : "—"]]);
    } else if (qualityPage) o.panel.querySelector("p")!.textContent = t("Detailed drop statistics were not recorded in this older save.", "Save cũ không lưu thống kê chi tiết từng lần thả.");
    else o.showStats([[t("Population", "Dân số"), number(r.population)], [t("Floors", "Tầng"), number(r.height)], [t("Accuracy", "Độ chính xác"), `${r.accuracy}%`],
      [t("Best streak", "Chuỗi tốt nhất"), number(r.bestStreak)], [t("Misses", "Lần trượt"), number(r.misses)], [t("Duration", "Thời gian"), `${(r.durationTicks / 60).toFixed(1)}s`]]);
    o.panel.classList.add("cb-data-panel"); refresh = () => details(id, back, qualityPage);
  }
  return { statistics, history, clear() { refresh = null; }, refresh() { refresh?.(); }, isOpen() { return refresh !== null; } };
}
