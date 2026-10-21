import { COSMETIC_CATALOG, type CosmeticCategory, type CosmeticItem } from "../../city-bloxx-content/cosmetics";
export { COSMETIC_CATALOG, type CosmeticCategory, type CosmeticItem };
import { BUILDING_IDS, type BuildingId } from "./buildings";
import type { GameSave } from "./save-state";
export interface RunEquipment { building: string; roof: string; crane: string }
export interface InventoryState {
  version: 1; owned: string[]; grants: { id: string; version: string; at: number }[];
  equipment: { buildings: Record<BuildingId, string>; roofs: Record<BuildingId, string>; crane: string };
}
const tag = (v: unknown): v is string => typeof v === "string" && /^[a-zA-Z0-9_.-]{1,80}$/.test(v);
const integer = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
export const DEFAULT_EQUIPMENT: Readonly<RunEquipment> = Object.freeze({ building: "default", roof: "default", crane: "default" });
export function emptyInventory(): InventoryState {
  const map = () => Object.fromEntries(BUILDING_IDS.map(id => [id, "default"])) as Record<BuildingId, string>;
  return { version: 1, owned: ["default"], grants: [], equipment: { buildings: map(), roofs: map(), crane: "default" } };
}
export function cosmeticItem(id: string, category: CosmeticCategory, classId: BuildingId): CosmeticItem | null {
  const actual = id === "default" ? category === "crane" ? "default-crane" : `default-${category}-${classId}` : id;
  return COSMETIC_CATALOG.find(d => d.id === actual && d.category === category && (d.classId === null || d.classId === classId)) ?? null;
}
export function renderCosmetic(id: string, category: CosmeticCategory, classId: BuildingId): CosmeticItem {
  const item = cosmeticItem(id, category, classId);
  return item?.available ? item : cosmeticItem("default", category, classId)!;
}
export function validateRunEquipment(value: RunEquipment | undefined, classId?: BuildingId): RunEquipment {
  if (value === undefined) return { ...DEFAULT_EQUIPMENT };
  if (!value || ![value.building, value.roof, value.crane].every(tag)) throw new Error("Invalid pinned equipment; original preserved");
  if (classId) for (const category of ["building","roof","crane"] as const) if (COSMETIC_CATALOG.some(d=>d.id===value[category]) && !cosmeticItem(value[category],category,classId)) throw new Error("Incompatible pinned equipment");
  return { building: value.building, roof: value.roof, crane: value.crane };
}
export function normalizeInventory(value: InventoryState, legacyOwned: readonly string[] = []): InventoryState {
  if (!value || !Array.isArray(value.owned) || value.owned.length > 128 || !value.owned.includes("default") || !value.owned.every(tag) || new Set(value.owned).size !== value.owned.length ||
    !value.equipment || !tag(value.equipment.crane) || ![value.equipment.buildings, value.equipment.roofs].every(map => !!map && BUILDING_IDS.every(id => tag(map[id]))) ||
    !legacyOwned.every(tag) || legacyOwned.length > 128) throw new Error("Invalid inventory; original preserved");
  const owned = [...new Set([...value.owned, ...legacyOwned])];
  if (owned.length > 128 || ![value.equipment.crane, ...Object.values(value.equipment.buildings), ...Object.values(value.equipment.roofs)].every(id => owned.includes(id) || COSMETIC_CATALOG.some(d => d.id === id && d.rule === "free"))) throw new Error("Unowned equipment; original preserved");
  if (value.version !== undefined && value.version !== 1 || value.grants !== undefined && (!Array.isArray(value.grants) || value.grants.length > 128 || new Set(value.grants.map(g => g?.id)).size !== value.grants.length || !value.grants.every(g => g && tag(g.id) && tag(g.version) && integer(g.at) && owned.includes(g.id)))) throw new Error("Invalid cosmetic receipts");
  for (const category of ["building", "roof", "crane"] as const) for (const id of BUILDING_IDS) {
    const equipped = category === "crane" ? value.equipment.crane : category === "building" ? value.equipment.buildings[id] : value.equipment.roofs[id];
    if (COSMETIC_CATALOG.some(d => d.id === equipped) && !cosmeticItem(equipped, category, id)) throw new Error("Incompatible equipment");
  }
  return { version: 1, owned, grants: JSON.parse(JSON.stringify(value.grants ?? [])), equipment: JSON.parse(JSON.stringify(value.equipment)) };
}
export function cosmeticProgress(save: GameSave, item: CosmeticItem): number {
  if (item.rule === "free") return 0;
  if (item.rule === "event" || item.rule === "season") return save.inventory.owned.includes(item.id) ? item.target : 0;
  if (item.rule === "completed") return Math.min(item.target, save.progression.counts.classes[item.classId!]);
  if (item.rule === "perfect") return Math.min(item.target, save.stats.byClass[item.classId!].quality.perfect);
  if (item.rule === "daily") return Math.min(item.target, save.daily.lifetimeCreditedDays);
  return COSMETIC_CATALOG.filter(d => d.set === item.set && d.category !== "badge" && save.inventory.owned.includes(d.id)).length;
}
export function ownsCosmetic(save: GameSave, item: CosmeticItem): boolean { return item.rule === "free" || save.inventory.owned.includes(item.id); }
export function validateCosmeticCatalog(catalog: readonly CosmeticItem[] = COSMETIC_CATALOG): void {
  if(!Array.isArray(catalog)||catalog.length>128||new Set(catalog.map(d=>d?.id)).size!==catalog.length)throw new Error("Invalid cosmetic catalog");
  for(const d of catalog)if(!d||!tag(d.id)||d.version!=="cosmetics-1"||!["building","roof","crane","badge"].includes(d.category)||!["default","brick","winter","season"].includes(d.set)||typeof d.available!=="boolean"||
    !["free","completed","perfect","daily","collection","event","season"].includes(d.rule)||!integer(d.target)||d.target>1000000||(d.rule==="free"?d.target!==0:d.target<1)||
    (d.coinPrice!==undefined&&(!integer(d.coinPrice)||d.coinPrice>1000000||(d.rule==="free"||d.category==="badge")&&d.coinPrice!==0))||
    (d.category==="building"||d.category==="roof"?d.classId===null||!BUILDING_IDS.includes(d.classId):d.classId!==null)||
    d.rule==="completed"&&d.category!=="building"||d.rule==="perfect"&&d.category!=="roof"||d.rule==="daily"&&d.category!=="crane"||d.rule==="collection"&&d.category!=="badge"||
    !Array.isArray(d.assets)||!d.assets.length||d.assets.length>3||d.assets.some((a:unknown)=>typeof a!=="string"||! /^(stack|city|rig|ui)\/(default|brick|winter|season)\/[a-z0-9_-]+\.(png|svg)$/.test(a))||
    !d.title||![d.title.en,d.title.vi].every(v=>typeof v==="string"&&v.length>0&&v.length<=160))throw new Error("Invalid cosmetic definition");
}
export function grantCosmetics(save: GameSave, at: number, catalog = COSMETIC_CATALOG): GameSave {
  validateCosmeticCatalog(catalog);
  if (!integer(at)) throw new Error("Invalid reward timestamp");
  let next = save;
  for (const item of catalog) {
    if (!item.available || item.rule === "free" || item.rule === "event" || item.rule === "season" || next.inventory.owned.includes(item.id) || cosmeticProgress(next, item) < item.target) continue;
    if (next.inventory.owned.length >= 128 || next.inventory.grants.length >= 128) throw new Error("Inventory bounds exceeded; previous preserved");
    next = { ...next, inventory: { ...next.inventory, owned: [...next.inventory.owned, item.id], grants: [...next.inventory.grants, { id: item.id, version: item.version, at }] } };
  }
  return next;
}
export function grantSpecificCosmetics(save: GameSave, itemIds: readonly string[], at: number, catalog = COSMETIC_CATALOG): GameSave {
  validateCosmeticCatalog(catalog);
  if (!integer(at)) throw new Error("Invalid reward timestamp");
  let next = save;
  for (const id of itemIds) {
    const item = catalog.find(d => d.id === id);
    if (!item || !item.available || next.inventory.owned.includes(item.id)) continue;
    if (next.inventory.owned.length >= 128 || next.inventory.grants.length >= 128) throw new Error("Inventory bounds exceeded; previous preserved");
    next = { ...next, inventory: { ...next.inventory, owned: [...next.inventory.owned, item.id], grants: [...next.inventory.grants, { id: item.id, version: item.version, at }] } };
  }
  return next;
}
export function buyCosmeticWithCoins(save: GameSave, itemId: string, at: number, catalog = COSMETIC_CATALOG): GameSave {
  validateCosmeticCatalog(catalog);
  if (!integer(at)) throw new Error("Invalid purchase timestamp");
  const item = catalog.find(d => d.id === itemId);
  if (!item || !item.available || item.category === "badge") throw new Error("Cosmetic is unavailable or cannot be purchased");
  if (ownsCosmetic(save, item)) return save;
  const price = item.coinPrice ?? 0;
  if (!integer(price) || price <= 0) throw new Error("Cosmetic cannot be purchased with coins");
  if (!integer(save.coins) || save.coins < price) throw new Error("Insufficient coins");
  if (save.inventory.owned.length >= 128 || save.inventory.grants.length >= 128) throw new Error("Inventory bounds exceeded; previous preserved");
  const receipt = `buy:${item.id}`;
  const coinReceipts = [...(save.coinReceipts ?? []).filter(r => r !== receipt), receipt].slice(-64);
  const bought: GameSave = {
    ...save,
    coins: save.coins - price,
    coinReceipts,
    inventory: {
      ...save.inventory,
      owned: [...save.inventory.owned, item.id],
      grants: [...save.inventory.grants, { id: item.id, version: item.version, at }],
    },
  };
  return grantCosmetics(bought, at, catalog);
}
export function equipCosmetic(save: GameSave, itemId: string, classId: BuildingId): GameSave {
  const item = COSMETIC_CATALOG.find(d => d.id === itemId);
  if (!item || !item.available || item.category === "badge" || item.classId !== null && item.classId !== classId || !ownsCosmetic(save, item)) throw new Error("Cosmetic is locked, unavailable or incompatible");
  const equipment = { ...save.inventory.equipment, buildings: { ...save.inventory.equipment.buildings }, roofs: { ...save.inventory.equipment.roofs } };
  if (item.category === "crane") equipment.crane = item.id;
  else if (item.category === "building") equipment.buildings[classId] = item.id;
  else equipment.roofs[classId] = item.id;
  return { ...save, inventory: { ...save.inventory, equipment } };
}
export function equipmentFor(save: GameSave, classId: BuildingId): RunEquipment {
  return { building: save.inventory.equipment.buildings[classId], roof: save.inventory.equipment.roofs[classId], crane: save.inventory.equipment.crane };
}

