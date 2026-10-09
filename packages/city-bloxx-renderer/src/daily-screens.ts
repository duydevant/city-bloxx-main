import { currentDailyStreak, dailyCountdown, dailyPerfectRate, isSettled, shiftUTCDate, utcDate, type GameSave, type RunRecord, type RunSummary } from "../../city-bloxx-core/src/index";
import { type SessionTextKey } from "../../city-bloxx-content/session-locales";

interface DailyScreenOptions {
  panel: HTMLElement; save(): GameSave; now(): number; t(key: SessionTextKey): string;
  button(label: string, action: () => void): HTMLButtonElement;
  showPanel(title: string, body: string, actions: HTMLButtonElement[]): void;
  showStats(rows: [string, string][]): void;
  start(dateUTC: string): void; resume(): void; discard(): void; home(): void; replay(record: RunRecord): void;
}
export function createDailyScreens(o: DailyScreenOptions) {
  const { t, button } = o;
  let refresh: (() => void) | null = null;
  let countdown: HTMLElement | null = null;
  let shownDate = "";
  function clear() { refresh = null; countdown = null; o.panel.classList.remove("cb-daily-panel"); }
  function entry(): void {
    const date = utcDate(o.now()), daily = o.save().daily, day = daily.days.find(d => d.dateUTC === date), pending = daily.pending;
    const actions = [button(t("Play Daily"), () => chooseStart(date))];
    if (pending) actions.push(button(t("Resume Daily"), o.resume));
    actions.push(button(t("Daily guide"), () => guide()), button(t("History"), () => history()), button(t("Home"), o.home));
    o.showPanel(t("Daily Tower"), `${date} UTC · ${t("Industrial")} · 20 ${t("floors")}\n${t("Personal result · not server verified")}`, actions);
    o.showStats([[t("Best complete population"), day?.bestComplete ? String(day.bestComplete.result.population) : "—"], [t("Attempts"), String(day?.attempts ?? 0)],
      [t("Daily streak"), String(currentDailyStreak(daily, date))], [t("Next Daily in"), clock()]]);
    countdown = o.panel.querySelector(".cb-stats>div:last-child dd"); shownDate = date;
    const strip = document.createElement("div"); strip.className = "cb-daily-strip"; strip.setAttribute("aria-label", t("Last seven UTC days"));
    for (let offset = -6; offset <= 0; offset++) {
      const d = shiftUTCDate(date, offset), played = daily.creditedDates.includes(d), cell = document.createElement("span");
      cell.textContent = `${d.slice(8)} ${played ? "✓" : "·"}`; cell.dataset.date = d; cell.dataset.credited = String(played);
      cell.title = `${d} UTC · ${played ? t("Played") : t("Not played")}`; cell.setAttribute("aria-label", cell.title); strip.append(cell);
    }
    o.panel.querySelector(".cb-actions")!.before(strip); o.panel.classList.add("cb-daily-panel"); refresh = entry;
  }
  function clock() {
    const seconds = dailyCountdown(o.now());
    return `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor(seconds % 3600 / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")} UTC`;
  }
  function chooseStart(date: string): void {
    const pending = o.save().daily.pending;
    if (!pending) { o.start(date); return; }
    const oldDate = pending.checkpoint.config.daily!.dateUTC;
    o.showPanel(t("Replace pending Daily?"), `${t("Your saved Daily belongs to")} ${oldDate} UTC`, [button(t("Resume Daily"), o.resume),
      button(t("Discard and play today"), () => { o.discard(); o.start(utcDate(o.now())); }), button(t("Keep pending Daily"), entry)]);
    refresh = () => chooseStart(utcDate(o.now()));
  }
  function guide(page = 0): void {
    const pages: SessionTextKey[][] = [
      ["Same UTC date and recipe give everyone the same tower. Local results are personal and not server verified.", "Build 20 Industrial body floors, including the unscored foundation, then try the roof once. Three lives; no Assist or continue."],
      ["Only complete bodies compete for your Daily best. A missed roof still completes the body. Failed attempts keep their own best height.", "One scored body drop credits the starting UTC day. Opening the menu or placing only the foundation does not count. Retry as often as you like."],
      ["The UTC day changes at 00:00 UTC, not local midnight. A saved run keeps its original date, seed and rules across midnight, pause, resize and language changes.", "Daily is available before City unlocks. Completing it does not unlock City classes or change Quick best scores. Moving the clock back never adds older streak days."],
    ];
    const actions = [];
    if (page > 0) actions.push(button(t("Previous"), () => guide(page - 1)));
    if (page < 2) actions.push(button(t("Next"), () => guide(page + 1)));
    actions.push(button(t("Back"), entry));
    o.showPanel(`${t("Daily guide")} · ${page + 1}/3`, "", actions);
    const content = document.createElement("section"), list = document.createElement("ul"); content.className = "cb-guide-content";
    for (const key of pages[page]) { const li = document.createElement("li"); li.textContent = t(key); list.append(li); }
    content.append(list); o.panel.querySelector("p")!.replaceWith(content); o.panel.classList.add("cb-guide-panel"); refresh = () => guide(page);
  }
  function history(page = 0): void {
    const daily = o.save().daily, date = utcDate(o.now());
    const dates = Array.from({ length: 7 }, (_, i) => shiftUTCDate(date, -i));
    const actions = [];
    if (page > 0) actions.push(button(t("Previous"), () => history(page - 1)));
    if (page < 2) actions.push(button(t("Next"), () => history(page + 1)));
    actions.push(button(t("Back"), entry));
    o.showPanel(`${t("Daily Tower")} · ${t("History")} · ${page + 1}/3`, `${t("Longest / lifetime days")}: ${daily.longestStreak} / ${daily.lifetimeCreditedDays}`, actions);
    const list = document.createElement("div"); list.className = "cb-history-list";
    for (const d of dates.slice(page * 3, page * 3 + 3)) {
      const day = daily.days.find(x => x.dateUTC === d), credited = daily.creditedDates.includes(d);
      list.append(button(`${d} UTC · ${credited ? t("Played") : t("Not played")}\n${t("Attempts")}: ${day?.attempts ?? 0} · ${t("Best")}: ${day?.bestComplete?.result.population ?? "—"}`, () => {
        o.showPanel(`${t("Daily Tower")} · ${d} UTC`, t("Personal result · not server verified"), [button(t("Back"), () => history(page))]);
        o.showStats([[t("Attempts"), String(day?.attempts ?? 0)], [t("Best complete population"), String(day?.bestComplete?.result.population ?? "—")],
          [t("Best failed height"), `${day?.bestFailedHeight ?? 0}/20`], [t("Daily streak"), credited ? t("UTC day credited") : t("Day not credited yet")]]);
        refresh = () => history(page);
      }));
    }
    o.panel.querySelector(".cb-actions")!.before(list); o.panel.classList.add("cb-data-panel", "cb-history-panel"); refresh = () => history(page);
  }
  function result(summary: RunSummary, previousBest: number, record: RunRecord, isReplay: boolean): void {
    const date = summary.daily!.dateUTC, actions = [button(t("Retry this Daily"), () => retry(date)), button(t("Replay / restart"), () => o.replay(record)), button(t("Home"), o.home)];
    const credited = o.save().daily.creditedDates.includes(date), delta = summary.complete ? Math.max(0, summary.result.population - previousBest) : 0;
    o.showPanel(`${isReplay ? t("Replay complete") : summary.complete ? t("Daily complete") : t("Daily incomplete")} · ${summary.result.rating}`, `${date} UTC · ${t("Personal result · not server verified")}`, actions);
    const roof = summary.metrics?.roof, quality = roof ? t(({ perfect: "Perfect", great: "Great", good: "Good", risky: "Risky", miss: "Miss" } as const)[roof]) : "—";
    o.showStats([[t("Population"), String(summary.result.population)], [t("Floors"), `${summary.result.height}/20 · ${summary.complete ? t("Complete") : t("Incomplete")}`],
      [t("Roof"), quality], [t("Perfect rate"), `${dailyPerfectRate(summary).toFixed(1)}%`],
      [credited ? t("UTC day credited") : t("Day not credited yet"), String(currentDailyStreak(o.save().daily, utcDate(o.now())))], [t("Personal-best delta"), summary.complete ? `+${delta}` : "—"]]);
    refresh = () => result(summary, previousBest, record, isReplay);
  }
  function retry(date: string): void {
    const pending = o.save().daily.pending;
    if (pending && (pending.checkpoint.config.daily!.dateUTC !== date || !isSettled(o.save(), pending.identity))) {
      o.showPanel(t("Replace pending Daily?"), `${t("Your saved Daily belongs to")} ${pending.checkpoint.config.daily!.dateUTC} UTC`, [
        button(t("Resume Daily"), o.resume), button(t("Discard and retry this Daily"), () => { o.discard(); o.start(date); }), button(t("Keep pending Daily"), entry)]);
      refresh = () => retry(date); return;
    }
    o.discard(); o.start(date);
  }
  return { entry, result, clear, isOpen: () => refresh !== null, refresh: () => refresh?.(), tick() {
    if (!countdown) return;
    if (utcDate(o.now()) !== shownDate) entry(); else countdown.textContent = clock();
  } };
}
