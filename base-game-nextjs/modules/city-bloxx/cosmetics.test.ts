import { describe, expect, it } from "vitest"
import { COSMETIC_CATALOG } from "../../../packages/city-bloxx-content/cosmetics"
import { acceptTrackedCity, allocateRun, beginCityTower, BUILDING_IDS, BUILDINGS, buyCosmeticWithCoins, claimMission, claimWeeklyContract, cosmeticItem, createOpponentReplicaGame, emptySave, ensureMissions, ensureWeeklyContracts, equipmentFor, equipCosmetic, extractLiveTelemetryFromSnapshot, grantCosmetics, initializeTracking, lockPvpStake, makeSummary, migrateSave, QuickTowerGame, refundPvpStake, renderCosmetic, resolvePvpMatchResult, restoreTower, runCoins, settlePvpWager, settleRun, STARTING_COINS, syncOpponentReplica, updateCityCheckpoint, validateCosmeticCatalog, validateTotalPot, type GameSave, type BuildingId } from "../../../packages/city-bloxx-core/src/index"
import { createFirebasePvpPort, InMemoryFirebaseRtdbEngine } from "../../lib/pvp/firebase-rtdb"
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
  it("maps the Brick hook attachment to the existing eye/load distance without changing rope geometry and anchors pulleys to the bottom edge",()=>{
    const b=BRICK_ANCHORS.hook,a=SPRITE_ANCHORS.hook,dx=(b.eye.x-b.tip.x)*b.scale,dy=(b.eye.y-b.tip.y)*b.scale
    expect(dx*Math.cos(b.rotation)-dy*Math.sin(b.rotation)).toBeCloseTo((a.eye.x-a.tip.x)*a.scale,8)
    expect(dx*Math.sin(b.rotation)+dy*Math.cos(b.rotation)).toBeCloseTo((a.eye.y-a.tip.y)*a.scale,8)
    expect(SPRITE_ANCHORS.crane.pulley.y).toBeGreaterThanOrEqual(150)
    expect(BRICK_ANCHORS.crane.pulley.y).toBeGreaterThanOrEqual(310)
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
  it("C8.2: awards coins from runs/missions/weekly contracts and allows purchasing cosmetics with coins",()=>{
    let s=initial()
    expect(s.coins).toBe(STARTING_COINS)
    const game=new QuickTowerGame({...golden.config,mode:"quick"})
    for(const d of golden.inputs){game.advanceTicks(d.tick-game.getTick());game.drop(d.fraction/1000)}game.advanceTicks(golden.endTick-game.getTick())
    const q=allocateRun(s,1000),summary=makeSummary(game,q.context,2000)
    const earned=runCoins(summary)
    expect(earned).toBeGreaterThan(0)
    s=settleRun(q.save,summary,game.getRecord())
    expect(s.coins).toBe(STARTING_COINS+earned)
    expect(s.history[0].coinsEarned).toBe(earned)
    // Buying brick-roof-residential (200 coins) works and is idempotent
    const beforeBuy=s.coins
    s=buyCosmeticWithCoins(s,"brick-roof-residential",2500)
    expect(s.coins).toBe(beforeBuy-200)
    expect(s.inventory.owned).toContain("brick-roof-residential")
    expect(s.coinReceipts).toContain("buy:brick-roof-residential")
    expect(buyCosmeticWithCoins(s,"brick-roof-residential",2600)).toBe(s)
    // Insufficient coins throws without mutating save
    expect(()=>buyCosmeticWithCoins(s,"season-crane",2700)).toThrow("Insufficient coins")
    // Badges and free items cannot be bought
    s={...s,coins:5000}
    expect(()=>buyCosmeticWithCoins(s,"brick-badge",2800)).toThrow("cannot be purchased")
    expect(buyCosmeticWithCoins(s,"default-crane",2800)).toBe(s)
    // Buying all 9 brick items unlocks brick-badge automatically
    for(const item of COSMETIC_CATALOG.filter(i=>i.set==="brick"&&i.category!=="badge")){
      s=buyCosmeticWithCoins(s,item.id,3000)
    }
    expect(s.inventory.owned).toContain("brick-badge")
    // Mission & Weekly Contract claims award coins once
    const atMs=Date.parse("2026-10-12T12:00:00Z")
    s=ensureWeeklyContracts(ensureMissions(s,atMs),atMs)
    const mSlot=s.progression.missionDays[0].slots[0]
    mSlot.progress=mSlot.definition.target;mSlot.status="ready";mSlot.completedAt=atMs
    const coinsBeforeMission=s.coins
    s=claimMission(s,"2026-10-12",mSlot.definition.id,atMs)
    expect(s.coins).toBe(coinsBeforeMission+15)
    const wSlot=s.liveOps.weekly.weeks[0].slots[0]
    wSlot.progress=wSlot.definition.target;wSlot.status="ready";wSlot.completedAt=atMs
    const coinsBeforeWeekly=s.coins
    s=claimWeeklyContract(s,s.liveOps.weekly.weeks[0].weekStartUTC,wSlot.definition.id,atMs)
    expect(s.coins).toBe(coinsBeforeWeekly+50)
  })
  it("C8.3: configures totalPot, locks escrow stakes, syncs live opponent replica, and awards 100% of totalPot to the higher tower after both exhaust 3 lives",async()=>{
    expect(()=>validateTotalPot(15)).toThrow()
    expect(()=>validateTotalPot(500,100)).toThrow("Insufficient Coins")
    expect(validateTotalPot(500,300)).toEqual({totalPot:500,stakePerPlayer:250})

    const engine=new InMemoryFirebaseRtdbEngine(1000)
    const port=createFirebasePvpPort({engine})
    let p1Save={...initial(),coins:600}
    let p2Save={...initial(),coins:400}

    const {room:created,slot:p1Slot}=await port.createRoom({
      totalPot:200,
      seed:777,
      host:{id:"u1",name:"HostBuilder",coins:p1Save.coins,equipment:{building:"brick-building-residential",roof:"default",crane:"season-crane"}},
    })
    expect(p1Slot).toBe("p1")
    expect(created.totalPot).toBe(200)
    expect(created.stakePerPlayer).toBe(100)

    const {room:joined,slot:p2Slot}=await port.joinRoom(created.roomCode,{
      id:"u2",
      name:"GuestSkyline",
      coins:p2Save.coins,
      equipment:{building:"default",roof:"winter-roof-residential",crane:"winter-crane"},
    })
    expect(p2Slot).toBe("p2")
    expect(joined.players.p2?.name).toBe("GuestSkyline")

    // If p2 readies and then host changes totalPot to 500, p2.ready resets automatically
    await port.setReady(created.roomId,"p2",true,p2Save.coins)
    const raised=await port.updateTotalPot(created.roomId,500)
    expect(raised.totalPot).toBe(500)
    expect(raised.stakePerPlayer).toBe(250)
    expect(raised.players.p2?.ready).toBe(false)

    // Both players ready up and lock 250 Coins into escrow
    await port.setReady(created.roomId,"p1",true,p1Save.coins)
    const activeRoom=await port.setReady(created.roomId,"p2",true,p2Save.coins)
    expect(activeRoom.status).toBe("active")

    p1Save=lockPvpStake(p1Save,created.roomId,activeRoom.stakePerPlayer)
    p2Save=lockPvpStake(p2Save,created.roomId,activeRoom.stakePerPlayer)
    expect(p1Save.coins).toBe(350)
    expect(p2Save.coins).toBe(150)

    // Refund is only allowed before settlement, let's verify idempotency of lockPvpStake
    expect(lockPvpStake(p1Save,created.roomId,activeRoom.stakePerPlayer)).toBe(p1Save)

    // Simulate P1 building a 14-floor tower before losing 3 lives, and P2 building a 9-floor tower before losing 3 lives
    const p1Game=new QuickTowerGame({seed:activeRoom.seed,mode:"quick",assist:false,building:activeRoom.building})
    for(let i=0;i<5;i++){
      placeAccurately(p1Game,0.01)
      const snap=p1Game.getSnapshot()
      const lastDrop=snap.drops[snap.drops.length-1]!
      await port.pushDrop(created.roomId,"p1",lastDrop,extractLiveTelemetryFromSnapshot(snap,2000+i))
    }
    // Verify P2's opponent replica reproduces P1's exact tower height and population
    const p2ViewOfP1=createOpponentReplicaGame(activeRoom.seed,activeRoom.building)
    const latestRoomSnap=engine.getRoom(created.roomId)!
    const replicaSnap=syncOpponentReplica(p2ViewOfP1,latestRoomSnap.drops.p1,latestRoomSnap.live.p1.tick)
    expect(replicaSnap.floors.length).toBe(p1Game.getSnapshot().floors.length)
    expect(replicaSnap.population).toBe(p1Game.getSnapshot().population)

    // P1 finishes first (14 floors, 0 lives) -> match is not resolved yet because P2 still has lives
    const partialResult=await port.finishOrResolve(created.roomId,"p1",{
      tick:1200,height:14,population:420,lives:0,combo:0,perfectCount:8,lastPlacement:"miss",phase:"ended",ended:true,updatedAt:3000,
    })
    expect(partialResult).toBeNull()
    expect(() => resolvePvpMatchResult(engine.getRoom(created.roomId)!, 3000)).toThrow("Both players must exhaust all 3 lives")

    // P2 finishes with fewer floors (9 floors, 0 lives) -> P2 loses, P1 wins 100% of the 500 Coin pot!
    const finalResult=await port.finishOrResolve(created.roomId,"p2",{
      tick:1350,height:9,population:260,lives:0,combo:0,perfectCount:4,lastPlacement:"miss",phase:"ended",ended:true,updatedAt:3500,
    })
    expect(finalResult).not.toBeNull()
    expect(finalResult!.winnerSlot).toBe("p1")
    expect(finalResult!.loserSlot).toBe("p2")
    expect(finalResult!.reason).toBe("higher_tower")
    expect(finalResult!.payouts).toEqual({p1:500,p2:0})
    expect(finalResult!.netDelta).toEqual({p1:250,p2:-250})

    p1Save=settlePvpWager(p1Save,created.roomId,"p1",finalResult!)
    p2Save=settlePvpWager(p2Save,created.roomId,"p2",finalResult!)
    expect(p1Save.coins).toBe(850) // 600 - 250 + 500 = 850 (+250 net)
    expect(p2Save.coins).toBe(150) // 400 - 250 + 0 = 150 (-250 net)
    expect( refundPvpStake(p2Save,created.roomId,250) ).toBe(p2Save) // Cannot refund after settlement

    // Check Firebase RTDB global stats & leaderboard
    const stats=engine.getStatsPayload()
    expect(stats.global.totalMatchesCompleted).toBe(1)
    expect(stats.global.totalCoinsWagered).toBe(500)
    expect(stats.global.biggestPotWon).toBe(500)
    expect(stats.global.highestPvpTower).toBe(14)
    expect(stats.global.totalFloorsBuiltInPvp).toBe(23)
    expect(stats.leaderboard[0].id).toBe("u1")
    expect(stats.leaderboard[0].wins).toBe(1)
    expect(stats.leaderboard[0].netCoinsWon).toBe(250)
  })

  it("C8.4: supports sessionScreen('pvp'), /pvp navigation, and /api/v1/city-bloxx/pvp Room Lobby equipment/emote/stats sync", async () => {
    const { sessionScreen } = await import("../../../packages/city-bloxx-renderer/src/session")
    const { WEB_LINKS } = await import("./web-content")
    const { GET, POST } = await import("../../app/api/v1/city-bloxx/pvp/route")
    const { NextRequest } = await import("next/server")

    expect(sessionScreen("pvp")).toBe("pvp")
    expect(WEB_LINKS.some(([href]) => href === "/pvp")).toBe(true)

    const createReq = new NextRequest("http://localhost:3000/api/v1/city-bloxx/pvp", {
      method: "POST",
      body: JSON.stringify({
        action: "createRoom",
        totalPot: 400,
        seed: 777,
        host: {
          id: "host-c84",
          name: "Host Builder",
          coins: 500,
          wins: 4,
          losses: 1,
          equipment: {
            building: "default",
            roof: "default",
            crane: "brick-crane",
          },
        },
      }),
    })
    const createRes = await POST(createReq)
    expect(createRes.status).toBe(200)
    const { room: created } = await createRes.json()
    expect(created.totalPot).toBe(400)
    expect(created.stakePerPlayer).toBe(200)
    expect(created.players.p1.equipment.crane).toBe("brick-crane")

    // Verify waiting room is listed in GET /api/v1/city-bloxx/pvp for the /pvp dashboard
    const statsRes = await GET(new NextRequest("http://localhost:3000/api/v1/city-bloxx/pvp"))
    const statsData = await statsRes.json()
    expect(statsData.waitingRooms.some((r: { roomCode: string }) => r.roomCode === created.roomCode)).toBe(true)

    // Opponent joins with custom equipment and sends emote
    const joinRes = await POST(
      new NextRequest("http://localhost:3000/api/v1/city-bloxx/pvp", {
        method: "POST",
        body: JSON.stringify({
          action: "joinRoom",
          roomCodeOrId: created.roomCode,
          guest: {
            id: "guest-c84",
            name: "Rival Architect",
            coins: 900,
            wins: 7,
            losses: 2,
            equipment: {
              building: "brick-building-residential",
              roof: "winter-roof-residential",
              crane: "season-crane",
            },
          },
        }),
      }),
    )
    const { room: joined } = await joinRes.json()
    expect(joined.players.p2.name).toBe("Rival Architect")
    expect(joined.players.p2.equipment).toEqual({
      building: "brick-building-residential",
      roof: "winter-roof-residential",
      crane: "season-crane",
    })

    const emoteRes = await POST(
      new NextRequest("http://localhost:3000/api/v1/city-bloxx/pvp", {
        method: "POST",
        body: JSON.stringify({
          action: "sendEmote",
          roomId: created.roomId,
          slot: "p2",
          emote: { id: "raise", text: "Raise the pot!", sentAt: 12345 },
        }),
      }),
    )
    const { room: afterEmote } = await emoteRes.json()
    expect(afterEmote.players.p2.emote).toEqual({ id: "raise", text: "Raise the pot!", sentAt: 12345 })
  })
})




