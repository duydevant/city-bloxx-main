import { type SessionTextKey } from "../../city-bloxx-content/session-locales";
import { BUILDING_IDS, cityPopulation, perfectRate, type BuildingId, type GameSave, type RunRecord, type RunSummary, type StatTotals, type StatsGroup } from "../../city-bloxx-core/src/index";

interface DataScreenOptions {
  panel: HTMLElement; save(): GameSave; t(en: SessionTextKey): string; className(id: BuildingId): string;
  showPanel(title: string, body: string, actions: HTMLButtonElement[]): void;
  showStats(stats: [string, string][]): void; button(label: string, action: () => void): HTMLButtonElement;
  home(): void; replay(record: RunRecord): void; pin(id: string | null): void;
}
export function createDataScreens(o: DataScreenOptions) {
  const { t, button } = o;
  let refresh: (() => void) | null = null;
  let statsPage=0, statsGroup: "all" | StatsGroup="all", statsClass:BuildingId="residential", historyPage=0, historyFilter:"all"|StatsGroup="all";
  const locale = () => o.panel.closest(".cb-game")?.getAttribute("lang") ?? "en";
  const number = (n: number) => n.toLocaleString(locale());
  const percent = (totals: StatTotals) => perfectRate(totals) === null ? t("No scored drops") : `${perfectRate(totals)}%`;
  const date = (stamp: number) => stamp ? new Intl.DateTimeFormat(locale(), { dateStyle: "short", timeStyle: "short" }).format(stamp) : t("Time unavailable");
  const qualityName = (quality: string | null) => quality === null ? "—" : ({ perfect: t("Perfect"), great: t("Great"), good: t("Good"), risky: t("Risky"), miss: t("Miss") })[quality as "perfect"];
  const modeName = (s: RunSummary) => s.mode === "daily" ? `${t("Daily Tower")} · ${s.daily!.dateUTC} UTC` : s.mode === "city" ? t("Build City") : s.assist ? t("Assist") : t("Standard");
  const label = (page: number) => [t("Overview"), t("Skill"), t("Class")][page];
  function selector<T extends string>(choices: [T, string][], selected: T, change: (value: T) => void): void {
    const select = document.createElement("select"); select.className = "cb-data-select";
    select.setAttribute("aria-label", t("Filter statistics and history"));
    for (const [value, name] of choices) { const option = document.createElement("option"); option.value = value; option.textContent = name; select.append(option); }
    select.value = selected; select.addEventListener("change", () => change(select.value as T));
    o.panel.querySelector("p")!.append(document.createElement("br"), select);
  }
  function statistics(page = statsPage, group: "all" | StatsGroup = statsGroup, building: BuildingId = statsClass): void {
    statsPage=page;statsGroup=group;statsClass=building;
    const save = o.save(), totals = page === 2 ? save.stats.byClass[building] : group === "all" ? save.stats.totals : save.stats.byMode[group];
    const actions: HTMLButtonElement[] = [];
    if (page > 0) actions.push(button(t("Previous"), () => statistics(page - 1, group, building)));
    if (page < 2) actions.push(button(t("Next"), () => statistics(page + 1, group, building)));
    actions.push(button(t("History"), () => history()), button(t("Home"), o.home));
    o.showPanel(`${t("Statistics")} · ${label(page)} · ${page + 1}/3`, `${t("Tracking since")}: ${date(save.stats.trackedSince)}\n${t("Older totals are not reconstructed.")}`, actions);
    if (page === 2) selector(BUILDING_IDS.map(id => [id, o.className(id)]), building, next => statistics(page, group, next));
    else selector([["all", t("All tracked runs")], ["quick-standard", t("Quick Standard")], ["quick-assist", t("Quick Assist")], ["city", t("Build City")], ["daily", t("Daily Tower")]], group, next => statistics(page, next, building));
    const quality = totals.quality;
    o.showStats(page === 1 ? [[t("Perfect rate"), percent(totals)], [t("Scored body drops"), number(totals.scoredBody)],
      [t("Great / Good / Risky"), `${quality.great} / ${quality.good} / ${quality.risky}`], [t("Body misses"), number(quality.miss)],
      [t("Perfect roofs"), number(totals.roof.perfect)], [t("Best combo / streak"), `${totals.maxCombo} / ${totals.bestStreak}`]] :
      [[t("Tracked attempts"), number(totals.attempts)], [t("Best height"), number(totals.bestHeight)],
      [t("Earned population"), number(totals.population)], [t("Complete bodies"), number(totals.completed)],
      [page === 2 ? t("Accepted complete City builds") : t("Accepted City builds"), number(page === 2 ? save.city.stats.byClass[building] : save.city.stats.builds)],
      [t("Current city population"), number(cityPopulation(save.city))]]);
    o.panel.classList.add("cb-data-panel"); refresh = () => statistics(page, group, building);
  }
  function history(page = historyPage, filter: "all" | StatsGroup = historyFilter): void {
    const rows = o.save().history.filter(s => filter === "all" || (filter === "city" || filter === "daily" ? s.mode === filter : s.mode === "quick" && s.assist === (filter === "quick-assist")));
    const pages = Math.max(1, Math.ceil(rows.length / 3)); page = Math.max(0, Math.min(page, pages - 1));
    historyPage=page;historyFilter=filter;
    const actions: HTMLButtonElement[] = [];
    if (page > 0) actions.push(button(t("Previous"), () => history(page - 1, filter)));
    if (page < pages - 1) actions.push(button(t("Next"), () => history(page + 1, filter)));
    actions.push(button(t("Statistics"), () => statistics()), button(t("Home"), o.home));
    o.showPanel(`${t("History")} · ${page + 1}/${pages}`, rows.length ? t("Up to 50 recent summaries; retained Quick and Daily replays can be played.") : t("No tracked runs yet. Play a tower to add its result here."), actions);
    selector([["all", t("All modes")], ["quick-standard", t("Quick Standard")], ["quick-assist", t("Quick Assist")], ["city", t("Build City")], ["daily", t("Daily Tower")]], filter, next => history(0, next));
    const list = document.createElement("div"); list.className = "cb-history-list";
    for (const s of rows.slice(page * 3, page * 3 + 3)) {
      const b = button(`${modeName(s)} · ${o.className(s.building)}\n${s.result.height} ${t("floors")} · ${number(s.result.population)} ${t("people")} · ${s.outcome === "abandoned" ? t("Stopped") : s.result.rating}`, () => details(s.identity.id, () => history(page, filter)));
      b.dataset.historyId = s.identity.id; list.append(b);
    }
    o.panel.querySelector(".cb-actions")!.before(list); o.panel.classList.add("cb-data-panel", "cb-history-panel");
    refresh = () => history(page, filter);
  }
  function details(id: string, back: () => void, qualityPage = false): void {
    const save = o.save(), summary = save.history.find(h => h.identity.id === id); if (!summary) { history(); return; }
    const archive = save.replays.find(r => r.id === id), metrics = summary.metrics;
    const unavailable = summary.replayStatus === "unsupported" ? t("Replay version unsupported") : summary.replayStatus === "pruned" ? t("Replay was pruned; summary is kept") : t("No replay recorded for this run");
    const actions = [button(qualityPage ? t("Result") : t("Drop quality"), () => details(id, back, !qualityPage))];
    if (archive) {
      actions.push(button(t("Replay"), () => o.replay(archive.record)));
      actions.push(button(save.replayRefs.pinned === id ? t("Unpin replay") : t("Pin replay"), () => { o.pin(save.replayRefs.pinned === id ? null : id); details(id, back, qualityPage); }));
    }
    actions.push(button(t("Back"), back));
    o.showPanel(`${modeName(summary)} · ${o.className(summary.building)}`, `${date(summary.endedAt)}\n${archive ? t("Personal result · not server verified") : unavailable}`, actions);
    const r = summary.result;
    if (qualityPage && metrics) {
      const total = Object.values(metrics.body).reduce((sum, n) => sum + n, 0);
      o.showStats([[t("Perfect"), `${metrics.body.perfect} · ${total ? (metrics.body.perfect / total * 100).toFixed(1) : "—"}%`], [t("Great / Good"), `${metrics.body.great} / ${metrics.body.good}`],
        [t("Risky / Miss"), `${metrics.body.risky} / ${metrics.body.miss}`], [t("Foundation · unscored"), String(metrics.foundation)],
        [t("Roof"), qualityName(metrics.roof)], [t("Signed error mean"), metrics.errorCount ? `${(metrics.signedErrorSum / metrics.errorCount * 100).toFixed(1)}%` : "—"]]);
    } else if (qualityPage) o.panel.querySelector("p")!.textContent = t("Detailed drop statistics were not recorded in this older save.");
    else o.showStats([[t("Population"), number(r.population)], [t("Floors"), number(r.height)], [t("Accuracy"), `${r.accuracy}%`],
      [t("Best streak"), number(r.bestStreak)], [t("Misses"), number(r.misses)], [t("Duration"), `${(r.durationTicks / 60).toFixed(1)}s`]]);
    o.panel.classList.add("cb-data-panel"); refresh = () => details(id, back, qualityPage);
  }
  return { statistics, history, details:(id:string)=>details(id,()=>history()), clear() { refresh = null; }, refresh() { refresh?.(); }, isOpen() { return refresh !== null; } };
}
