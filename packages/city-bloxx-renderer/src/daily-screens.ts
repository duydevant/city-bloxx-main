import { currentDailyStreak, dailyCountdown, isSettled, shiftUTCDate, utcDate, type GameSave, type RunRecord, type RunSummary } from "../../city-bloxx-core/src/index";
import { type SessionTextKey } from "../../city-bloxx-content/session-locales";
import { bigButton, formatNumber, icon, node, pill, roundButton, type ResultCardOptions } from "./ui-kit";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const WEEKDAYS_EN = ["S", "M", "T", "W", "T", "F", "S"];
const WEEKDAYS_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

interface DailyScreenOptions {
  panel: HTMLElement; save(): GameSave; now(): number; t(key: SessionTextKey): string;
  button(label: string, action: () => void): HTMLButtonElement;
  showPanel(title: string, body: string, actions: HTMLButtonElement[]): void;
  showStats(rows: [string, string][]): void;
  start(dateUTC: string): void; resume(): void; discard(): void; home(): void; replay(record: RunRecord): void;
  online?: {label():string;start():void};
  vi(): boolean;
  screen(title: string, className: string): HTMLElement;
  resultScreen(title: string, card: ResultCardOptions, primary: HTMLButtonElement, secondary: (HTMLButtonElement | null)[], extra?: HTMLElement[]): void;
  coins(): string | undefined;
}
export function createDailyScreens(o: DailyScreenOptions) {
  const { t, button } = o;
  let refresh: (() => void) | null = null;
  let countdown: HTMLElement | null = null;
  let shownDate = "";
  function clear() { refresh = null; countdown = null; o.panel.classList.remove("cb-daily-panel"); }
  function entry(): void {
    const date = utcDate(o.now()), daily = o.save().daily, day = daily.days.find(d => d.dateUTC === date), pending = daily.pending, vi = o.vi();
    const panel = o.screen(t("Daily Tower"), "cb-daily-panel");
    const wrap = node("div", "cb-daily");
    const best = day?.bestComplete ? formatNumber(day.bestComplete.result.population, vi) : "—";
    const top = node("div", "cb-top");
    top.append(roundButton("chevron-left", t("Home"), o.home), pill("trophy", best, t("Best complete population"), "cb-best-pill"), roundButton("history", t("History"), () => history()));

    const [, month, dayOfMonth] = date.split("-").map(Number);
    const calendar = node("div", "cb-daily-cal");
    calendar.title = `${date} UTC`;
    calendar.append(node("span", "cb-daily-month", vi ? `T${month}` : MONTHS[month - 1]), node("strong", "cb-daily-date", String(dayOfMonth)));

    const streakDays = currentDailyStreak(daily, date);
    const streak = node("div", "cb-daily-streak");
    streak.setAttribute("role", "img"); streak.setAttribute("aria-label", `${t("Daily streak")}: ${streakDays}`); streak.title = t("Daily streak");
    streak.append(icon("flame", 40), node("strong", "", String(streakDays)));

    const strip = node("div", "cb-daily-strip"); strip.setAttribute("aria-label", t("Last seven UTC days"));
    for (let offset = -6; offset <= 0; offset++) {
      const d = shiftUTCDate(date, offset), played = daily.creditedDates.includes(d), cell = node("span", "cb-daily-cell");
      cell.dataset.date = d; cell.dataset.credited = String(played); cell.dataset.today = String(offset === 0);
      cell.title = `${d} UTC · ${played ? t("Played") : t("Not played")}`; cell.setAttribute("aria-label", cell.title);
      const dot = node("span", "cb-daily-dot");
      if (played) dot.append(icon("check", 18));
      cell.append(dot, node("small", "", (vi ? WEEKDAYS_VI : WEEKDAYS_EN)[new Date(`${d}T00:00:00Z`).getUTCDay()]));
      strip.append(cell);
    }

    const target = node("div", "cb-daily-target");
    target.setAttribute("role", "img"); target.setAttribute("aria-label", `${t("Industrial")} · 20 ${t("floors")}`); target.title = target.getAttribute("aria-label")!;
    target.append(icon("building-2", 22, "cb-daily-target-chip"), icon("layers", 18), node("strong", "", "20"));

    const primary = pending ? bigButton("play", t("Resume Daily"), o.resume) : bigButton("play", t("Play Daily"), () => chooseStart(date));
    const row = node("div", "cb-result-row");
    if (pending) row.append(roundButton("plus", t("Discard and play today"), () => chooseStart(date), "cb-round-lg"));
    if (o.online) row.append(roundButton("crown", o.online.label(), o.online.start, "cb-round-lg"));
    row.append(roundButton("help-circle", t("Daily guide"), () => guide(), "cb-round-lg"));
    const actions = node("div", "cb-result-actions");
    actions.append(primary, row);

    const next = node("p", "cb-daily-clock");
    next.title = t("Next Daily in"); next.setAttribute("aria-label", t("Next Daily in"));
    countdown = node("span", "", clock());
    next.append(icon("clock", 16), countdown);

    wrap.append(top, calendar, streak, strip, target, actions, next);
    panel.append(wrap);
    primary.focus({ preventScroll: true });
    shownDate = date; refresh = entry;
  }
  function clock() {
    const seconds = dailyCountdown(o.now());
    return `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor(seconds % 3600 / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
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
    const date = summary.daily!.dateUTC, vi = o.vi();
    const credited = o.save().daily.creditedDates.includes(date);
    const roof = summary.metrics?.roof, quality = roof ? t(({ perfect: "Perfect", great: "Great", good: "Good", risky: "Risky", miss: "Miss" } as const)[roof]) : "—";
    const primary = bigButton("rotate-ccw", t("Retry this Daily"), () => retry(date));
    const note = node("p", "cb-result-note", `${date} UTC · ${summary.complete ? t("Daily complete") : t("Daily incomplete")}${credited ? ` · ${t("UTC day credited")}` : ""}`);
    o.resultScreen(`${isReplay ? t("Replay complete") : summary.complete ? t("Daily complete") : t("Daily incomplete")} · ${summary.result.rating}`, {
      rating: summary.result.rating,
      value: formatNumber(summary.result.population, vi),
      valueLabel: t("Population"),
      ribbon: !isReplay && summary.complete && summary.result.population > previousBest ? (vi ? "Kỷ lục mới" : "New best") : undefined,
      coins: isReplay ? undefined : o.coins(),
      stats: [
        { icon: "layers", value: `${summary.result.height}/20`, label: t("Floors") },
        { icon: "crown", value: quality, label: t("Roof") },
        { icon: "flame", value: String(currentDailyStreak(o.save().daily, utcDate(o.now()))), label: t("Daily streak") },
      ],
    }, primary, [roundButton("home", t("Home"), o.home, "cb-round-lg"), roundButton("eye", t("Replay / restart"), () => o.replay(record), "cb-round-lg")], [note]);
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
