import { describe, expect, it } from "vitest"
import catalog from "../../../packages/city-bloxx-content/buildings.json"
import { placeAccurately } from "./test-simulation"
import { acceptCityTower, adjacentLots, beginCityTower, BUILDING_IDS, BUILDINGS, cancelCityTower, checkpointTower, cityPopulation, commitRun, demolishCityBuilding, emptyCity, emptySave, floorSway, migrateSave, placementStatus, QuickTowerGame, restoreTower, updateCityCheckpoint, validateCity, type BuildingId, type CitySave } from "../../../packages/city-bloxx-core/src/index"

function until(game: QuickTowerGame, check: () => boolean) {
  for (let tick=0;tick<4000;tick++) { if(check()) return;game.advanceTicks(1) }
  throw new Error("City test tick limit")
}
function place(game: QuickTowerGame) {
  until(game,()=>{
    const s=game.getSnapshot(), index=s.floors.length-1
    const top=index>=0?s.floors[index].x+floorSway(s,index):0
    return s.phase==="swing" && Math.abs(s.current.x-top)<3
  })
  const id=game.getSnapshot().feedbackId
  game.drop(1);until(game,()=>game.getSnapshot().feedbackId>id)
}
function miss(game: QuickTowerGame) {
  until(game,()=>{
    const s=game.getSnapshot(), index=s.floors.length-1
    const top=index>=0?s.floors[index].x+floorSway(s,index):0
    // Reachable with the shorter cable, but well beyond the 40% miss boundary.
    return s.phase==="swing" && Math.abs(s.current.x-top)>115
  })
  const id=game.getSnapshot().feedbackId
  game.drop(1);until(game,()=>game.getSnapshot().feedbackId>id)
  until(game,()=>["swing","ended"].includes(game.getPhase()))
}
function fullTower(classId: BuildingId, roof=true) {
  const game=new QuickTowerGame({seed:42,mode:"city",building:classId,assist:false})
  for(let floor=0;floor<BUILDINGS[classId].floors;floor++) placeAccurately(game)
  until(game,()=>game.getPhase()==="swing")
  expect(game.getSnapshot().isRoof).toBe(true)
  if(roof)placeAccurately(game);else miss(game)
  expect(game.getPhase()).toBe("ended")
  return game
}
function fixtureCity() {
  const city=emptyCity();city.unlocked=[...BUILDING_IDS];city.nextRun=4
  for(const [lot,classId,runId] of [[7,"residential","city-1"],[11,"industrial","city-2"],[13,"office","city-3"]] as const) {
    city.lots[lot]={runId,classId,skin:"default",floors:BUILDINGS[classId].floors,population:100,roof:true,complete:true,accuracy:90,rating:"A"}
  }
  return city
}
function finish(city: CitySave, game: QuickTowerGame) {
  const pending=city.pending!;return acceptCityTower(updateCityCheckpoint(city,game),pending.runId)
}

describe("C3 Build City",()=>{
  it("keeps the content catalog synchronized with the simulation rules",()=>{
    expect(catalog.geometry).toEqual({width:144,height:120})
    for(const entry of catalog.buildings) {
      const rules=BUILDINGS[entry.id as BuildingId]
      expect(entry.floors).toBe(rules.floors)
      expect(entry.population).toBe(rules.population)
      expect(entry.requires).toEqual(rules.requires)
    }
  })
  it("locks the narrowed 1.2:1 collision box into both modes",()=>{
    const game=new QuickTowerGame(42)
    until(game,()=>Math.abs(game.getSnapshot().current.x)>125)
    game.drop();until(game,()=>game.getSnapshot().floors.length===1)
    expect(game.getSnapshot().floors).toHaveLength(1)
  })
  it("uses four-direction adjacency with no row wrapping or diagonals",()=>{
    expect(adjacentLots(0)).toEqual([5,1])
    expect(adjacentLots(4)).toEqual([9,3])
    expect(adjacentLots(12)).toEqual([7,17,11,13])
    const city=fixtureCity()
    expect(placementStatus(city,12,"highrise").valid).toBe(true)
    expect(placementStatus(city,0,"highrise").valid).toBe(false)
    expect(placementStatus(city,8,"office").missing).toContain("industrial")
    expect(placementStatus(emptyCity(),12,"industrial").locked).toBe(true)
  })
  for(const id of BUILDING_IDS) {
    it(`completes ${id} with ${BUILDINGS[id].floors} body floors and one separate roof`,()=>{
      const game=fullTower(id), s=game.getSnapshot()
      expect(s.floors).toHaveLength(BUILDINGS[id].floors)
      expect(s.roof).not.toBeNull()
      expect(game.getResult().ranked).toBe(false)
      expect(game.getResult().ratingVersion).toBe("city-rating-1")
      expect(game.drop()).toBe(false)
      expect(restoreTower(checkpointTower(game)).getSnapshot()).toEqual(s)
    })
  }
  it("ends after the first roof miss, retaining a completed body without roof bonus",()=>{
    const game=fullTower("residential",false)
    expect(game.getSnapshot().roof).toBeNull()
    expect(game.getResult().height).toBe(10)
    expect(game.getResult().rating).not.toBe("S")
    const city=beginCityTower(emptyCity(),12,"residential",42), result=finish(city,game)
    expect(result.lots[12]?.complete).toBe(true)
    expect(result.unlocked).toContain("industrial")
  })
  it("restores a pending fall, a resolved floor and an ended placement exactly",()=>{
    const game=new QuickTowerGame({seed:42,mode:"city",building:"residential",assist:false})
    until(game,()=>Math.abs(game.getSnapshot().current.x)<3);game.drop(.37);game.advanceTicks(5)
    expect(restoreTower(checkpointTower(game)).getSnapshot()).toEqual(game.getSnapshot())
    until(game,()=>game.getPhase()==="settling")
    expect(restoreTower(checkpointTower(game)).getSnapshot()).toEqual(game.getSnapshot())
    const city=beginCityTower(emptyCity(),12,"residential",42), ended=fullTower("residential")
    const saved={...emptySave(),city:updateCityCheckpoint(city,ended)}
    expect(migrateSave(JSON.parse(JSON.stringify(saved))).city).toEqual(saved.city)
  })
  it("commits a result once and rebuilds without doubling city population",()=>{
    const game=fullTower("residential"), pending=beginCityTower(emptyCity(),12,"residential",42)
    const once=finish(pending,game), twice=acceptCityTower(once,pending.pending!.runId)
    expect(twice).toEqual(once)
    expect(once.stats.builds).toBe(1)
    expect(cityPopulation(once)).toBe(game.getResult().population)
    const rebuild=beginCityTower(once,12,"residential",42)
    expect(cityPopulation(rebuild)).toBe(cityPopulation(once))
    expect(cancelCityTower(rebuild).lots).toEqual(once.lots)
    const replaced=finish(rebuild,game)
    expect(cityPopulation(replaced)).toBe(cityPopulation(once))
    expect(replaced.stats.builds).toBe(2)
    expect(replaced.pending).toBeNull()
  })
  it("keeps unfinished towers without unlock and never occupies a lot with zero floors",()=>{
    const partial=new QuickTowerGame({seed:42,mode:"city",building:"residential",assist:false})
    place(partial);for(let i=0;i<3;i++)miss(partial)
    const saved=finish(beginCityTower(emptyCity(),12,"residential",42),partial)
    expect(saved.lots[12]?.floors).toBe(1)
    expect(saved.lots[12]?.complete).toBe(false)
    expect(saved.unlocked).toEqual(["residential"])
    const zero=new QuickTowerGame({seed:42,mode:"city",building:"residential",assist:false,legacyScoring:true})
    for(let i=0;i<3;i++)miss(zero)
    expect(finish(beginCityTower(saved,12,"residential",42),zero).lots[12]).toEqual(saved.lots[12])
    expect(finish(beginCityTower(emptyCity(),0,"residential",42),zero).lots[0]).toBeNull()
  })
  it("does not invalidate existing buildings or relock classes when supports are demolished",()=>{
    const city=fixtureCity(), result=finish(beginCityTower(city,12,"highrise",42),fullTower("highrise"))
    const demolished=demolishCityBuilding(result,7)
    expect(demolished.lots[12]).toEqual(result.lots[12])
    expect(demolished.unlocked).toEqual(result.unlocked)
    expect(cityPopulation(demolished)).toBe(cityPopulation(result)-100)
    expect(placementStatus(demolished,12,"highrise").valid).toBe(false)
  })
  it("migrates old Quick saves, falls back unknown skins and preserves corrupt city saves",()=>{
    const migrated=migrateSave({schema:2,standardQuickBest:88,runs:5})
    expect(migrated.schema).toBe(5);expect(migrated.standardQuickBest).toBe(88)
    expect(migrated.city.lots).toHaveLength(25)
    const city=fixtureCity();(city.lots[7]! as {skin:string}).skin="unknown"
    expect(validateCity(city).lots[7]?.skin).toBe("unknown") // Renderer falls back without deleting the snapshot ID.
    expect(()=>migrateSave({...emptySave(),city:{...city,lots:[]}})).toThrow("preserved")
    const pending=beginCityTower(emptyCity(),12,"residential",42)
    pending.pending!.checkpoint.version="old"
    expect(()=>validateCity(pending)).toThrow("preserved")
  })
  it("does not let City results enter Quick PB or submission and bounds checkpoint data",()=>{
    expect(()=>commitRun(emptySave(),fullTower("residential").getRecord())).toThrow("Quick")
    const game=fullTower("highrise")
    expect(JSON.stringify(checkpointTower(game)).length).toBeLessThan(12000)
    expect(()=>restoreTower({...checkpointTower(game),tick:432001})).toThrow("preserved")
  })
})
