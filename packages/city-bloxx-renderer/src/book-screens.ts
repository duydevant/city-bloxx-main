import { COSMETIC_CATALOG, type CosmeticCategory, type CosmeticItem } from "../../city-bloxx-content/cosmetics";
import { BUILDING_IDS, BUILDINGS, cosmeticItem, cosmeticProgress, equipmentFor, ownsCosmetic, type BuildingId, type GameSave, type RunEquipment } from "../../city-bloxx-core/src/index";
import type { QuickTowerRenderer } from "./index";
import { type LucideIconName } from "./lucide-icons";
import { bigButton, formatNumber, icon, node, pill, roundButton } from "./ui-kit";
interface Options {
  panel: HTMLElement; renderer: QuickTowerRenderer; assets: string; save(): GameSave; vi(): boolean; className(id: BuildingId): string;
  showPanel(title: string, body: string, actions: HTMLButtonElement[]): void; button(label: string, action: () => void): HTMLButtonElement;
  screen(title: string, className: string): HTMLElement;
  home(): void; equip(id: BuildingId, equipment: RunEquipment): void; buy?(itemId: string): void; saveStatus(): string; retrySave(): void;
}
type ShopCategory = Exclude<CosmeticCategory, "badge">;
const CATEGORIES: { id: ShopCategory; icon: LucideIconName; en: string; vi: string }[] = [
  { id: "building", icon: "building-2", en: "Building", vi: "Nhà" },
  { id: "roof", icon: "home", en: "Roof", vi: "Mái" },
  { id: "crane", icon: "construction", en: "Crane", vi: "Cần cẩu" },
];
const SET_NAMES = { default: ["Default", "Mặc định"], brick: ["Brick", "Gạch"], winter: ["Frost", "Sương giá"], season: ["Gold S1", "Vàng S1"] } as const;

/** Skin shop: pick a building class and a part, preview it live, then equip or buy with coins. */
export function createBookScreens(o: Options) {
  let refresh: (() => void) | null = null, generation = 0, shownSave = "";
  let classIndex = 0, category: ShopCategory = "building", selectedId: string | null = null;
  const t = (en: string, vi: string) => o.vi() ? vi : en;
  const asset = (path: string) => `${o.assets.replace(/\/$/, "")}/${path}`;
  function clear() { refresh = null; generation++; o.panel.classList.remove("cb-book-panel", "cb-shop-panel"); }
  function equipped(id: BuildingId): RunEquipment {
    const current = equipmentFor(o.save(), id);
    return {
      building: cosmeticItem(current.building, "building", id)?.id ?? `default-building-${id}`,
      roof: cosmeticItem(current.roof, "roof", id)?.id ?? `default-roof-${id}`,
      crane: cosmeticItem(current.crane, "crane", id)?.id ?? "default-crane",
    };
  }
  function itemsFor(id: BuildingId, part: ShopCategory): CosmeticItem[] {
    return COSMETIC_CATALOG.filter(d => d.category === part && (d.classId === null || d.classId === id));
  }
  function thumb(item: CosmeticItem): string {
    return asset(item.assets.find(a => a.startsWith("city/")) ?? item.assets[0]);
  }
  function lockHint(save: GameSave, item: CosmeticItem): { icon: LucideIconName; text: string; ratio: number } | null {
    if (ownsCosmetic(save, item) || item.rule === "free") return null;
    if (item.rule === "event") return { icon: "sparkles", text: t("Event", "Sự kiện"), ratio: 0 };
    if (item.rule === "season") return { icon: "crown", text: t("Season", "Mùa giải"), ratio: 0 };
    const progress = cosmeticProgress(save, item);
    const ruleIcon: LucideIconName = item.rule === "perfect" ? "star" : item.rule === "daily" ? "calendar" : "building-2";
    return { icon: ruleIcon, text: `${progress}/${item.target}`, ratio: Math.min(1, progress / Math.max(1, item.target)) };
  }
  function grindText(item: CosmeticItem): string {
    if (item.rule === "completed") return t(`or finish ${item.target} towers`, `hoặc xây xong ${item.target} tháp`);
    if (item.rule === "perfect") return t(`or ${item.target} Perfect floors`, `hoặc ${item.target} tầng Perfect`);
    if (item.rule === "daily") return t(`or ${item.target} Daily days`, `hoặc ${item.target} ngày Daily`);
    return "";
  }
  function drawPreview(canvas: HTMLCanvasElement, status: HTMLElement, id: BuildingId, equipment: RunEquipment, locked: boolean, action: HTMLButtonElement) {
    const token = ++generation;
    const wasDisabled = action.disabled;
    action.disabled = true;
    status.dataset.state = "loading";
    void o.renderer.loadEquipment(id, equipment).then(() => {
      if (token !== generation || !refresh) return;
      o.renderer.drawPreview(canvas, id, equipment, locked);
      status.dataset.state = "ready";
      action.disabled = wasDisabled;
    }).catch(() => {
      if (token !== generation || !refresh) return;
      status.dataset.state = "error";
      status.replaceChildren(roundButton("rotate-ccw", t("Retry artwork", "Thử tải hình lại"), () => drawPreview(canvas, status, id, equipment, locked, action)));
    });
  }

  function shop() {
    const save = o.save(), vi = o.vi(), id = BUILDING_IDS[classIndex];
    const current = equipped(id);
    const items = itemsFor(id, category);
    const selected = items.find(d => d.id === selectedId) ?? items.find(d => d.id === current[category]) ?? items[0];
    selectedId = selected.id;
    const draft: RunEquipment = { ...current, [category]: selected.id };
    const owned = ownsCosmetic(save, selected), isEquipped = current[category] === selected.id;
    const pending = o.saveStatus() === "pending";

    o.screen(`${t("Skins", "Skin")} · ${o.className(id)}`, "cb-shop-panel");
    o.panel.classList.add("cb-book-panel");
    const wrap = node("div", "cb-shop");

    const top = node("div", "cb-top");
    const brickBadge = COSMETIC_CATALOG.find(d => d.id === "brick-badge")!;
    const collected = COSMETIC_CATALOG.filter(d => d.set === "brick" && d.category !== "badge" && save.inventory.owned.includes(d.id)).length;
    const collection = pill(save.inventory.owned.includes(brickBadge.id) ? "award" : "lock", `${collected}/${brickBadge.target}`, brickBadge.title[vi ? "vi" : "en"], "cb-collection-chip");
    const right = node("div", "cb-top-group");
    right.append(collection, pill("coins", formatNumber(save.coins ?? 0, vi), t("Coins", "Xu"), "cb-coin-chip"));
    top.append(roundButton("chevron-left", t("Home", "Trang chủ"), o.home), right);

    const stage = node("div", "cb-shop-stage");
    const canvas = node("canvas", "cb-shop-preview");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", `${t("Preview", "Xem trước")}: ${selected.title[vi ? "vi" : "en"]}`);
    const status = node("div", "cb-shop-status");
    status.dataset.bookAsset = "";
    status.append(node("span", "cb-spinner cb-spinner-sm"));
    const nameTag = node("div", "cb-shop-name");
    nameTag.append(node("strong", "", selected.title[vi ? "vi" : "en"]));
    stage.append(canvas, status, nameTag);

    const classes = node("div", "cb-shop-classes");
    BUILDING_IDS.forEach((classId, index) => {
      const b = node("button", "cb-class-card");
      b.type = "button";
      b.dataset.class = classId;
      b.setAttribute("aria-pressed", String(index === classIndex));
      b.setAttribute("aria-label", `${o.className(classId)} · ${BUILDINGS[classId].floors}`);
      b.title = o.className(classId);
      b.style.setProperty("--cb-class-color", BUILDINGS[classId].color);
      const set = cosmeticItem(equipped(classId).building, "building", classId)?.set ?? "default";
      const art = node("img", "cb-building-art");
      art.src = asset(`city/${set}/city_${classId}_${set}_mini.png`); art.alt = ""; art.draggable = false;
      art.addEventListener("error", () => { art.src = asset(`city/default/city_${classId}_default_mini.png`); }, { once: true });
      b.append(art, node("span", "cb-class-floors", String(BUILDINGS[classId].floors)));
      b.addEventListener("click", () => { classIndex = index; selectedId = null; shop(); });
      classes.append(b);
    });

    const tabs = node("div", "cb-segment");
    tabs.setAttribute("role", "tablist");
    for (const c of CATEGORIES) {
      const tab = node("button", "cb-segment-btn");
      tab.type = "button";
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(c.id === category));
      tab.append(icon(c.icon, 18), node("span", "", vi ? c.vi : c.en));
      tab.addEventListener("click", () => { category = c.id; selectedId = null; shop(); });
      tabs.append(tab);
    }

    const grid = node("div", "cb-shop-grid");
    for (const item of items) {
      const card = node("button", "cb-shop-item");
      card.type = "button";
      card.dataset.cosmeticId = item.id;
      card.dataset.set = item.set;
      card.disabled = !item.available;
      card.setAttribute("aria-pressed", String(item.id === selected.id));
      card.setAttribute("aria-label", `${t("Preview", "Xem trước")} ${item.title[vi ? "vi" : "en"]}`);
      card.title = item.title[vi ? "vi" : "en"];
      const art = node("span", "cb-shop-item-art");
      const img = node("img");
      img.src = thumb(item); img.alt = ""; img.draggable = false;
      img.addEventListener("error", () => { img.hidden = true; }, { once: true });
      art.append(img);
      const name = node("small", "cb-shop-item-name", SET_NAMES[item.set][vi ? 1 : 0]);
      const state = node("span", "cb-shop-item-state");
      const itemOwned = ownsCosmetic(save, item);
      if (current[category] === item.id) { state.dataset.state = "equipped"; state.append(icon("check", 14), node("span", "", t("On", "Đang dùng"))); }
      else if (itemOwned) { state.dataset.state = "owned"; state.append(icon("check-circle-2", 14), node("span", "", t("Owned", "Đã có"))); }
      else if (item.coinPrice) { state.dataset.state = "price"; state.append(icon("coins", 14), node("span", "", formatNumber(item.coinPrice, vi))); }
      else { state.dataset.state = "locked"; state.append(icon("lock", 14)); }
      card.append(art, name, state);
      const hint = lockHint(save, item);
      if (hint) {
        const bar = node("span", "cb-shop-progress");
        bar.title = hint.text;
        bar.style.setProperty("--ratio", hint.ratio.toFixed(3));
        bar.append(icon(hint.icon, 12), node("span", "", hint.text));
        card.append(bar);
      }
      card.addEventListener("click", () => { selectedId = item.id; shop(); });
      grid.append(card);
    }

    let action: HTMLButtonElement;
    const canBuy = !!o.buy && selected.available && !owned && (selected.coinPrice ?? 0) > 0;
    if (!selected.available) {
      action = bigButton("lock", t("Coming soon", "Sắp có"), () => {});
      action.disabled = true;
    } else if (isEquipped) {
      action = bigButton("check", t("Equipped", "Đang dùng"), () => {});
      action.disabled = true;
      action.dataset.cosmeticEquip = "";
    } else if (owned) {
      action = bigButton("check", t("Equip", "Trang bị"), () => { if (!action.disabled) { o.equip(id, draft); shop(); } });
      action.disabled = pending;
      action.dataset.cosmeticEquip = "";
    } else if (canBuy) {
      const price = selected.coinPrice!;
      const enough = (save.coins ?? 0) >= price;
      action = bigButton("coins", enough ? `${t("Buy", "Mua")} · ${formatNumber(price, vi)}` : t(`Need ${formatNumber(price - (save.coins ?? 0), vi)} more`, `Thiếu ${formatNumber(price - (save.coins ?? 0), vi)} xu`), () => {
        if (action.disabled) return;
        o.buy!(selected.id);
        shop();
      });
      action.dataset.cosmeticBuy = selected.id;
      action.disabled = !enough || pending;
    } else {
      action = bigButton("lock", t("Locked", "Chưa mở"), () => {});
      action.disabled = true;
    }
    const actions = node("div", "cb-shop-actions");
    actions.append(action);
    const grind = !owned && selected.available ? grindText(selected) : "";
    const note = node("p", "cb-shop-note");
    note.dataset.bookSave = "";
    const saveState = o.saveStatus();
    shownSave = saveState;
    if (saveState === "error") {
      note.dataset.state = "error";
      note.append(icon("alert-triangle", 16), node("span", "", t("Save failed", "Lưu lỗi")));
      actions.append(roundButton("rotate-ccw", t("Retry save", "Thử lưu lại"), o.retrySave, "cb-round-lg cb-round-warn"));
    } else if (saveState === "pending") note.append(node("span", "", t("Saving…", "Đang lưu…")));
    else if (grind) note.append(node("span", "", grind));
    else note.append(node("span", "", t("Looks only · never changes score", "Chỉ đổi hình · không ảnh hưởng điểm")));

    wrap.append(top, stage, classes, tabs, grid, actions, note);
    o.panel.append(wrap);
    refresh = shop;
    drawPreview(canvas, status, id, draft, !owned, action);
    (action.disabled ? grid.querySelector<HTMLElement>("[aria-pressed=\"true\"]") : action)?.focus({ preventScroll: true });
  }

  function book() { shop(); }
  return { book, clear, isOpen: () => !!refresh, refresh: () => refresh?.(), tick: () => { if (refresh && shownSave !== o.saveStatus()) refresh(); } };
}

