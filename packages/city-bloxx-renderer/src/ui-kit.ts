import { lucideSvg, type LucideIconName } from "./lucide-icons";

// Small DOM helpers for the minimal game UI: icons and numbers first, few words.

export function node<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

export function icon(name: LucideIconName, size = 20, className = ""): HTMLSpanElement {
  const wrap = node("span", ["cb-ico", className].filter(Boolean).join(" "));
  wrap.innerHTML = lucideSvg(name, size);
  return wrap;
}

export function formatNumber(value: number, vi: boolean): string {
  return value.toLocaleString(vi ? "vi-VN" : "en-US");
}

/** Icon-only round button; the label is kept for screen readers and tooltips. */
export function roundButton(name: LucideIconName, label: string, action: () => void, className = ""): HTMLButtonElement {
  const button = node("button", ["cb-round-btn", className].filter(Boolean).join(" "));
  button.type = "button";
  button.innerHTML = lucideSvg(name, 24);
  button.setAttribute("aria-label", label);
  button.title = label;
  button.addEventListener("click", action);
  return button;
}

/** The one big yellow call to action of a screen. */
export function bigButton(name: LucideIconName, label: string, action: () => void, className = ""): HTMLButtonElement {
  const button = node("button", ["cb-big-btn", className].filter(Boolean).join(" "));
  button.type = "button";
  button.append(icon(name, 26), node("span", "", label));
  button.addEventListener("click", action);
  return button;
}

export interface TileOptions {
  icon: LucideIconName;
  label: string;
  value?: string;
  valueIcon?: LucideIconName;
  tone?: "blue" | "red" | "green" | "gold" | "purple" | "slate";
  dot?: boolean;
  pressed?: boolean;
  action: () => void;
}

/** Square tile: colored icon chip, an optional big number and a one or two word label. */
export function tile(o: TileOptions): HTMLButtonElement {
  const button = node("button", "cb-tile");
  button.type = "button";
  button.dataset.tone = o.tone ?? "blue";
  if (o.pressed !== undefined) button.setAttribute("aria-pressed", String(o.pressed));
  const chip = node("span", "cb-tile-chip");
  chip.innerHTML = lucideSvg(o.icon, 26);
  button.append(chip);
  if (o.value !== undefined) {
    const value = node("strong", "cb-tile-value");
    if (o.valueIcon) value.append(icon(o.valueIcon, 18, "cb-tile-value-icon"));
    value.append(node("span", "", o.value));
    button.append(value);
  }
  button.append(node("small", "cb-tile-label", o.label));
  if (o.dot) button.append(node("span", "cb-tile-dot"));
  button.addEventListener("click", o.action);
  return button;
}

/** Rounded pill holding an icon and a number. */
export function pill(name: LucideIconName, value: string, label: string, className = ""): HTMLSpanElement {
  const element = node("span", ["cb-pill", className].filter(Boolean).join(" "));
  element.setAttribute("role", "img");
  element.setAttribute("aria-label", `${label}: ${value}`);
  element.title = label;
  element.append(icon(name, 20), node("strong", "", value));
  return element;
}

export interface ResultStat { icon: LucideIconName; value: string; label: string }
export interface ResultCardOptions {
  rating: string;
  value: string;
  valueLabel: string;
  stats: ResultStat[];
  ribbon?: string;
  coins?: string;
  coinsLabel?: string;
  note?: string;
}

export function resultCard(o: ResultCardOptions): HTMLElement {
  const card = node("section", "cb-result-card");
  if (o.ribbon) {
    const ribbon = node("div", "cb-result-ribbon");
    ribbon.append(icon("trophy", 18), node("span", "", o.ribbon));
    card.append(ribbon);
  }
  const rating = node("div", "cb-result-rating", o.rating);
  rating.dataset.rating = o.rating;
  card.append(rating);
  const main = node("div", "cb-result-main");
  const sub = node("span", "cb-result-sub");
  sub.append(icon("users", 16), node("span", "", o.valueLabel));
  main.append(node("strong", "cb-result-value", o.value), sub);
  card.append(main);
  if (o.coins) {
    const coins = node("span", "cb-result-coins");
    coins.setAttribute("aria-label", `${o.coinsLabel ?? "Coins"}: ${o.coins}`);
    coins.append(icon("coins", 18), node("strong", "", o.coins));
    card.append(coins);
  }
  const stats = node("dl", "cb-result-stats");
  for (const stat of o.stats) {
    const cell = node("div", "cb-result-stat");
    const term = node("dt");
    term.append(icon(stat.icon, 22), node("span", "", stat.label));
    // dt must precede dd; CSS shows the number on top.
    cell.append(term, node("dd", "", stat.value));
    stats.append(cell);
  }
  card.append(stats);
  if (o.note) card.append(node("p", "cb-result-note", o.note));
  return card;
}
