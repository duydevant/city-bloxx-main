import { describe, expect, it } from "vitest"
import { COSMETIC_CATALOG } from "../../../packages/city-bloxx-content/cosmetics"
import { acceptTrackedCity, allocateRun, beginCityTower, BUILDING_IDS, BUILDINGS, cosmeticItem, emptySave, equipmentFor, equipCosmetic, grantCosmetics, initializeTracking, makeSummary, migrateSave, QuickTowerGame, renderCosmetic, restoreTower, settleRun, updateCityCheckpoint, validateCosmeticCatalog, type GameSave, type BuildingId } from "../../../packages/city-bloxx-core/src/index"
import { BRICK_ANCHORS } from "../../../packages/city-bloxx-renderer/src/sprites"
import { SPRITE_ANCHORS } from "../../../packages/city-bloxx-renderer/src/geometry"
import { placeAccurately } from "./test-simulation"
import golden from "../../../packages/city-bloxx-core/fixtures/quick-mixed-v13.json"
const initial=()=>initializeTracking(emptySave(),"cosmetics-test",1000)
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v))
function perfect(s:GameSave,id:BuildingId,count:number){const totals=s.stats.byClass[id];totals.quality.perfect=count;totals.scoredBody=count;totals.landedBody=count;totals.errorCount=count;}
function milestones(){const s=initial();for(const id of BUILDING_IDS){s.progression.counts.classes[id]=20;perfect(s,id,50);}s.daily.lifetimeCreditedDays=7;return s}
describe("C4.3 cosmetic ownership and snapshots",()=>{
  it("rejects malformed versioned rules and asset paths without granting ownership",()=>{
    validateCosmeticCatalog()
    for(const bad of [{...COSMETIC_CATALOG[0],target:-1},{...COSMETIC_CATALOG[0],target:Number.MAX_SAFE_INTEGER},{...COSMETIC_CATALOG[0],assets:["../secret.png"]},{...COSMETIC_CATALOG[0],title:{en:"",vi:""}}])expect(()=>grantCosmetics(initial(),2000,[bad])).toThrow("Invalid cosmetic")
    expect(()=>validateCosmeticCatalog([COSMETIC_CATALOG[0],COSMETIC_CATALOG[0]])).toThrow()
    expect(()=>beginCityTower(initial().city,12,"residential",42,{building:"brick-building-office",roof:"default",crane:"default"})).toThrow("Incompatible")
  })
  it("maps the Brick hook attachment to the existing eye/load distance without changing rope geometry",()=>{
    const b=BRICK_ANCHORS.hook,a=SPRITE_ANCHORS.hook,dx=(b.eye.x-b.tip.x)*b.scale,dy=(b.eye.y-b.tip.y)*b.scale
    expect(dx*Math.cos(b.rotation)-dy*Math.sin(b.rotation)).toBeCloseTo((a.eye.x-a.tip.x)*a.scale,8)
    expect(dx*Math.sin(b.rotation)+dy*Math.cos(b.rotation)).toBeCloseTo((a.eye.y-a.tip.y)*a.scale,8)
  })
  it("has stable IDs, compatible classes, complete assets and free defaults",()=>{
    expect(COSMETIC_CATALOG).toHaveLength(24);expect(new Set(COSMETIC_CATALOG.map(i=>i.id)).size).toBe(24)
    expect(COSMETIC_CATALOG.filter(i=>i.set==="brick")).toHaveLength(10)
    expect(COSMETIC_CATALOG.filter(i=>i.set==="winter")).toHaveLength(3)
    expect(COSMETIC_CATALOG.filter(i=>i.set==="season")).toHaveLength(2)
    for(const item of COSMETIC_CATALOG){expect(item.available).toBe(true);expect(item.assets.length).toBeGreaterThan(0);expect(item.title.en).toBeTruthy();expect(item.title.vi).toBeTruthy()}
    expect(cosmeticItem("brick-roof-residential","building","residential")).toBeNull()
    expect(cosmeticItem("default","building","industrial")?.set).toBe("default")
  })
  for(const classId of BUILDING_IDS)it(`grants ${classId} building/roof at 20 complete and 50 Perfect without XP`,()=>{
    const s=initial();s.progression.counts.classes[classId]=19;perfect(s,classId,49)
    expect(grantCosmetics(s,2000)).toBe(s)
    s.progression.counts.classes[classId]=20;let next=grantCosmetics(s,2000)
    expect(next.inventory.owned).toContain(`brick-building-${classId}`);expect(next.inventory.owned).not.toContain(`brick-roof-${classId}`)
    perfect(next,classId,50);next=grantCosmetics(next,3000)
    expect(next.inventory.owned).toContain(`brick-roof-${classId}`);expect(next.progression.xp).toBe(0)
    expect(grantCosmetics(migrateSave(copy(next)),4000)).toEqual(next)
  })
  it("grants crane at seven credited days and collection after all nine items, once",()=>{
    const s=initial();s.daily.lifetimeCreditedDays=6;expect(grantCosmetics(s,2000)).toBe(s)
    s.daily.lifetimeCreditedDays=7;expect(grantCosmetics(s,2000).inventory.owned).toContain("brick-crane")
    const all=grantCosmetics(milestones(),2000)
    expect(all.inventory.owned).toHaveLength(11);expect(all.inventory.owned).toContain("brick-badge")
    expect(all.inventory.grants).toHaveLength(10);expect(grantCosmetics(all,3000)).toBe(all)
    expect(all.progression.xp).toBe(0)
  })
  it("does not grant unavailable content, then retroactively grants once when enabled",()=>{
    const s=milestones();const disabled=COSMETIC_CATALOG.map(i=>({...i,available:i.set!=="brick"}))
    expect(grantCosmetics(s,2000,disabled)).toBe(s)
    const enabled=grantCosmetics(s,3000);expect(enabled.inventory.grants.every(g=>g.at===3000)).toBe(true)
    expect(grantCosmetics(enabled,4000)).toBe(enabled)
  })
  it("rejects locked/category/class equip, allows mixed building/roof/crane and preserves unknown ownership",()=>{
    expect(()=>equipCosmetic(initial(),"brick-building-residential","residential")).toThrow()
    let s=grantCosmetics(milestones(),2000)
    expect(()=>equipCosmetic(s,"brick-building-office","residential")).toThrow()
    expect(()=>equipCosmetic(s,"brick-badge","residential")).toThrow()
    expect(()=>equipCosmetic(s,"missing","residential")).toThrow()
    s=equipCosmetic(s,"brick-building-residential","residential");s=equipCosmetic(s,"default-roof-residential","residential");s=equipCosmetic(s,"brick-crane","residential")
    expect(equipmentFor(s,"residential")).toEqual({building:"brick-building-residential",roof:"default-roof-residential",crane:"brick-crane"})
    s.inventory.owned.push("future-skin");s.inventory.equipment.buildings.office="future-skin"
    const loaded=migrateSave(copy(s));expect(loaded.inventory.owned).toContain("future-skin");expect(loaded.inventory.equipment.buildings.office).toBe("future-skin")
    expect(renderCosmetic("future-skin","building","office").set).toBe("default")
    expect(migrateSave(copy(loaded))).toEqual(loaded)
  })
  it("migrates legacy City ownership into the only GameSave inventory without clearing snapshots",()=>{
    const s=initial(), raw={...s,city:{...s.city,inventory:{skins:["default","future-skin"]}}}
    const loaded=migrateSave(raw);expect(loaded.inventory.owned).toEqual(["default","future-skin"])
    expect("inventory" in loaded.city).toBe(false)
  })
  it("pins City equipment through paused changes/reload and keeps skyline unchanged until rebuild",()=>{
    let s=grantCosmetics(milestones(),2000);s=equipCosmetic(s,"brick-building-residential","residential");s=equipCosmetic(s,"brick-crane","residential")
    const pinned=equipmentFor(s,"residential"),q=allocateRun(s,3000);s=q.save
    s.city=beginCityTower(s.city,12,"residential",42,pinned);s.tracking.pendingCity={...q.context,equipment:pinned,cityRunId:s.city.pending!.runId}
    const game=new QuickTowerGame({seed:42,mode:"city",assist:false,building:"residential"});placeAccurately(game,.02);s.city=updateCityCheckpoint(s.city,game)
    s=equipCosmetic(s,"default-building-residential","residential");s=equipCosmetic(s,"default-crane","residential")
    s=migrateSave(copy(s));expect(s.city.pending!.equipment).toEqual(pinned);expect(s.tracking.pendingCity!.equipment).toEqual(pinned)
    const resumed=restoreTower(s.city.pending!.checkpoint);for(let i=1;i<=BUILDINGS.residential.floors;i++)placeAccurately(resumed,.02)
    s.city=updateCityCheckpoint(s.city,resumed);s=acceptTrackedCity(s,s.city.pending!.runId,4000)
    expect(s.city.lots[12]?.skin).toBe(pinned.building);expect(s.city.lots[12]?.roofSkin).toBe(pinned.roof)
    s=equipCosmetic(s,"default-building-residential","residential");expect(s.city.lots[12]?.skin).toBe(pinned.building)
    expect(migrateSave(copy(s)).city.lots[12]).toEqual(s.city.lots[12])
  })
  it("keeps golden replay/collision identical with cosmetic context and rewards the milestone on settlement",()=>{
    const game=new QuickTowerGame({...golden.config,mode:"quick"})
    for(const d of golden.inputs){game.advanceTicks(d.tick-game.getTick());game.drop(d.fraction/1000)}game.advanceTicks(golden.endTick-game.getTick())
    const original=game.getRecord();expect(original).toEqual(golden)
    for(const equipment of [{building:"default",roof:"default",crane:"default"},{building:"brick-building-residential",roof:"brick-roof-residential",crane:"brick-crane"},{building:"brick-building-residential",roof:"default",crane:"default"}]){
      const s=initial();perfect(s,"residential",49);const q=allocateRun(s,1000),context={...q.context,equipment}
      const settled=settleRun(q.save,makeSummary(game,context,2000),original)
      expect(settled.history[0].result).toEqual(golden.result);expect(settled.history[0].unlockedCosmetics).toContain("brick-roof-residential")
      expect(migrateSave(copy(settled)).history[0].equipment).toEqual(equipment)
    }
  })
})
