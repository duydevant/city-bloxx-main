import { activeGhostMarker, BUILDINGS, floorSway, QUICK_TOWER_RULES as R, type BuildingId, type PersonalGhost, type QuickTowerSnapshot } from "../../city-bloxx-core/src/index";
import { loadPose, project, rigGeometry, SPRITE_ANCHORS as A, type Point } from "./geometry";
import { BRICK_ANCHORS, buildingSourceRect } from "./sprites";
import { placementLabel } from "./feedback";
import { parachutePose, POPULATION_DURATION, POPULATION_SPRITES } from "./population";
import { DEFAULT_EQUIPMENT, renderCosmetic, type RunEquipment } from "../../city-bloxx-core/src/cosmetics";

interface GameImages { sky: HTMLImageElement; floor: HTMLImageElement; crane: HTMLImageElement; hook: HTMLImageElement }
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image(); image.decoding = "async";
    const timer = window.setTimeout(() => reject(new Error(`Asset timeout: ${src}`)), 5000);
    image.onload = () => {
      // Finish decoding off the draw path rather than on the first animated drawImage.
      void image.decode().catch(() => {}).then(() => { clearTimeout(timer); resolve(image); });
    };
    image.onerror = () => { clearTimeout(timer); reject(new Error(`Could not load asset: ${src}`)); };
    image.src = src;
  });
}
export class QuickTowerRenderer {
  private readonly context: CanvasRenderingContext2D;
  private images: GameImages | null = null;
  private background: HTMLCanvasElement | null = null;
  private sprites = new Map<string, HTMLCanvasElement>();
  private vi = false;
  private populationImages = new Map<BuildingId, {person:HTMLCanvasElement;parachute:HTMLCanvasElement;harness:number;eye:number}>();
  private populationLoads = new Map<BuildingId, Promise<void>>();
  private feedbackSeen = 0;
  private completionSeen = false;
  private populationFx: {building:BuildingId;count:number;elapsed:number;x:number;y:number;population:number} | null = null;
  private buildingImages = new Map<string, { base: HTMLImageElement; mid: HTMLImageElement; roof: HTMLImageElement }>();
  private equipment: RunEquipment = { ...DEFAULT_EQUIPMENT };
  private customCranes = new Map<"brick" | "winter" | "season", { rig: HTMLImageElement; hook: HTMLImageElement }>();
  private ghost: PersonalGhost | null = null;
  private cssWidth = 1;
  private cssHeight = 1;
  private dpr = 1;
  private readonly assetBase: string;
  constructor(private readonly canvas: HTMLCanvasElement, assetBase: string) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is not available");
    this.context = context; this.assetBase = assetBase.replace(/\/$/, "");
  }
  async load(): Promise<void> {
    const [sky, floor, crane, hook] = await Promise.all([
      loadImage(`${this.assetBase}/bg/default/bg_stack_default_sky.png`),
      loadImage(`${this.assetBase}/stack/default/bldg_residential_default_mid.png`),
      loadImage(`${this.assetBase}/stack/default/crane_rig_default_sprite.png`),
      loadImage(`${this.assetBase}/stack/default/crane_hook_default_sprite.png`),
    ]);
    this.images = { sky, floor, crane, hook };
    this.background = null;
    this.sprites.clear();this.warmSprites();
  }
  async loadBuilding(id: BuildingId, set: "default" | "brick" | "winter" | "season" = "default"): Promise<void> {
    await this.loadPopulation(id);
    const key = `${id}:${set}`;
    if (this.buildingImages.has(key)) return;
    if (set === "winter") {
      await this.loadBuilding(id, "default");
      const def = this.buildingImages.get(`${id}:default`)!;
      const roof = id === "residential" ? await loadImage(`${this.assetBase}/stack/winter/bldg_residential_winter_roof.png`) : def.roof;
      this.buildingImages.set(key, { base: def.base, mid: def.mid, roof });
      this.warmSprites();
      return;
    }
    if (set === "season") {
      await this.loadBuilding(id, "default");
      this.buildingImages.set(key, this.buildingImages.get(`${id}:default`)!);
      return;
    }
    const [base, mid, roof] = await Promise.all(["base", "mid", "roof"].map(part => loadImage(`${this.assetBase}/stack/${set}/bldg_${id}_${set}_${part}.png`)));
    this.buildingImages.set(key, { base, mid, roof });
    this.warmSprites();
  }
  setEquipment(value: RunEquipment = { ...DEFAULT_EQUIPMENT }): void { this.equipment = { ...value }; }
  setGhost(ghost: PersonalGhost | null): void { this.ghost = ghost; }
  getGhost(): PersonalGhost | null { return this.ghost; }
  drawPreview(canvas: HTMLCanvasElement, building: BuildingId, equipment: RunEquipment, locked = false): void {
    canvas.width=240;canvas.height=190;const ctx=canvas.getContext("2d")!;ctx.clearRect(0,0,240,190);
    ctx.fillStyle="#243e50";ctx.fillRect(0,0,240,190);
    const scale=.34,w=R.floorWidth*scale,h=R.floorHeight*scale,left=58-w/2,bottom=185;
    for(const [part,index] of [["base",0],["mid",1],["mid",2],["roof",3]] as const) {
      const set=renderCosmetic(part==="roof"?equipment.roof:equipment.building,part==="roof"?"roof":"building",building).set;
      const image=this.buildingImages.get(`${building}:${set}`)?.[part],a=buildingSourceRect(building,part,set);
      if(image)ctx.drawImage(image,a.x,a.y,a.width,a.height,left,bottom-(index+1)*h,w,h);
    }
    const craneSet = renderCosmetic(equipment.crane,"crane",building).set;
    const themedCrane = craneSet !== "default" ? this.customCranes.get(craneSet) : null;
    const rig=themedCrane?themedCrane.rig:this.images?.crane,hook=themedCrane?themedCrane.hook:this.images?.hook;
    const a=themedCrane?BRICK_ANCHORS.crane:A.crane;
    if(rig)ctx.drawImage(rig,a.x,a.y,a.width,a.height,100,16,130,a.height/a.width*130);
    if(hook)ctx.drawImage(hook,0,0,128,128,180,73,27,27);
    if(locked) {ctx.fillStyle="rgba(0,0,0,.65)";ctx.fillRect(0,112,240,24);ctx.fillStyle="#ffdf78";ctx.font="bold 11px system-ui";ctx.textAlign="center";ctx.fillText(this.vi?"XEM TRƯỚC · CHƯA MỞ":"LOCKED PREVIEW",120,128);}
  }
  async loadEquipment(id: BuildingId, value: RunEquipment): Promise<void> {
    const sets = new Set([renderCosmetic(value.building, "building", id).set, renderCosmetic(value.roof, "roof", id).set]);
    await Promise.all([...sets].map(set => this.loadBuilding(id, set)));
    const craneSet = renderCosmetic(value.crane, "crane", id).set;
    if (craneSet !== "default" && !this.customCranes.has(craneSet)) {
      const [rig, hook] = await Promise.all(["rig", "hook"].map(part => loadImage(`${this.assetBase}/rig/${craneSet}/crane_${part}_${craneSet}_sprite.png`)));
      this.customCranes.set(craneSet, { rig, hook }); this.warmSprites();
    }
  }
  private buildingSprite(building: BuildingId, part: "base" | "mid" | "roof") {
    const chosen = renderCosmetic(part === "roof" ? this.equipment.roof : this.equipment.building, part === "roof" ? "roof" : "building", building).set;
    const themed = this.buildingImages.get(`${building}:${chosen}`)?.[part];
    if (themed) return { image: themed, set: chosen };
    return { image: this.buildingImages.get(`${building}:default`)?.[part] ?? (building === "residential" && part === "mid" ? this.images?.floor : null), set: "default" as const };
  }
  setLocale(locale: string): void { this.vi = locale.startsWith("vi"); }
  resetEffects(feedbackId = 0): void { this.feedbackSeen = feedbackId; this.populationFx = null; this.completionSeen = false; }
  dispose(): void {
    this.sprites.clear(); this.populationImages.clear(); this.populationLoads.clear(); this.buildingImages.clear();
    this.background = null; this.images = null; this.customCranes.clear(); this.populationFx = null; this.ghost = null;
  }
  async loadPopulation(id: BuildingId): Promise<void> {
    if (this.populationLoads.has(id)) return this.populationLoads.get(id);
    const promise = Promise.all([
      loadImage(`${this.assetBase}/fx/population/default/person_${id}_default_fall.png`),
      loadImage(`${this.assetBase}/fx/population/default/parachute_${id}_default_open.png`)
    ]).then(([person,parachute]) => {
      // Pre-rasterize small runtime sprites once; original source PNGs stay untouched.
      const crops:Record<BuildingId,[number,number,number,number,number,number]> = {
        residential:[230,160,558,1210,660,.884], industrial:[214,122,593,1285,668,.929],
        office:[315,194,407,1152,650,.923], highrise:[252,224,518,1100,678,.920]
      };
      const [x,y,w,h,harness,eye]=crops[id];
      const body=document.createElement("canvas");body.width=48;body.height=96;body.dataset.populationSprite="person";
      body.getContext("2d")!.drawImage(person,x,y,w,h,0,0,48,96);
      const canopy=document.createElement("canvas");canopy.width=160;canopy.height=120;canopy.dataset.populationSprite="parachute";
      canopy.getContext("2d")!.drawImage(parachute,0,0,160,120);
      this.populationImages.set(id,{person:body,parachute:canopy,harness:(harness-y)/h*48,eye:eye*60});
    }).catch(() => {});
    this.populationLoads.set(id,promise); return promise;
  }
  updateEffects(seconds: number): void {
    if (this.populationFx) {
      this.populationFx.elapsed += Math.max(0,Math.min(.1,seconds));
      if (this.populationFx.elapsed >= POPULATION_DURATION) this.populationFx=null;
    }
  }
  hasPopulationEffect(): boolean { return !!this.populationFx; }
  resize(width: number, height: number, dpr = window.devicePixelRatio || 1): void {
    if (this.cssWidth === Math.max(1, width) && this.cssHeight === Math.max(1, height) && this.dpr === Math.min(2, Math.max(1, dpr))) return;
    this.background = null;
    this.cssWidth = Math.max(1, width); this.cssHeight = Math.max(1, height);
    this.dpr = Math.min(2, Math.max(1, dpr));
    this.canvas.width = Math.round(this.cssWidth * this.dpr); this.canvas.height = Math.round(this.cssHeight * this.dpr);
    this.canvas.style.width = `${this.cssWidth}px`; this.canvas.style.height = `${this.cssHeight}px`;
    this.sprites.clear();this.warmSprites();
  }
  private cachedSprite(key:string,image:HTMLImageElement,x:number,y:number,w:number,h:number,width:number,height:number): HTMLCanvasElement {
    const cached=this.sprites.get(key);if(cached)return cached;
    const sprite=document.createElement("canvas");sprite.width=Math.max(1,Math.ceil(width*this.dpr));sprite.height=Math.max(1,Math.ceil(height*this.dpr));
    sprite.getContext("2d")!.drawImage(image,x,y,w,h,0,0,sprite.width,sprite.height);
    this.sprites.set(key,sprite);return sprite;
  }
  private warmSprites(): void {
    if(!this.images)return;
    const scale=Math.min(this.cssHeight/R.worldHeight,this.cssWidth/R.worldWidth);
    for(const key of new Set(["residential:default",...this.buildingImages.keys()]))for(const part of ["base","mid","roof"] as const) {
      const [id,set] = key.split(":") as [BuildingId,"default"|"brick"|"winter"|"season"];
      const image=this.buildingImages.get(key)?.[part]??(key==="residential:default"&&part==="mid"?this.images.floor:null);
      if(image) { const a=buildingSourceRect(id,part,set);this.cachedSprite(`${key}:${part}`,image,a.x,a.y,a.width,a.height,R.floorWidth*scale,R.floorHeight*scale); }
    }
    const a=A.crane,ratio=a.scale*scale;
    this.cachedSprite("crane",this.images.crane,a.x,a.y,a.width,a.height,a.width*ratio,a.height*ratio);
    this.cachedSprite("hook",this.images.hook,0,0,128,128,128*A.hook.scale*scale,128*A.hook.scale*scale);
    for (const [set, crane] of this.customCranes.entries()) {
      const a=BRICK_ANCHORS.crane;this.cachedSprite(`${set}-crane`,crane.rig,a.x,a.y,a.width,a.height,a.width*a.scale*scale,a.height*a.scale*scale);
      const ratio=BRICK_ANCHORS.hook.scale*scale;
      this.cachedSprite(`${set}-hook`,crane.hook,0,0,128,128,128*ratio,128*ratio);
    }
  }
  render(snapshot: QuickTowerSnapshot, previous?: QuickTowerSnapshot, alpha = 1, reducedMotion = false): void {
    const complete = !!snapshot.targetFloors && snapshot.phase === "ended" && snapshot.floors.length === snapshot.targetFloors;
    if (snapshot.feedbackId !== this.feedbackSeen || (complete && !this.completionSeen)) {
      this.feedbackSeen = snapshot.feedbackId;
      if (complete) this.completionSeen = true;
      const quick = !snapshot.targetFloors && snapshot.floors.length > 1 && snapshot.lastPlacement && snapshot.lastPlacement !== "miss";
      if (complete || quick) {
        const last = snapshot.floors[snapshot.floors.length-1];
        const quality = complete ? snapshot.roof?.quality ?? last.quality : snapshot.lastPlacement!;
        this.populationFx = {building:snapshot.building,count:POPULATION_SPRITES[snapshot.building][quality],elapsed:0,
          x:last.x,y:R.groundY-(snapshot.floors.length-.5)*R.floorHeight,
          population:complete?snapshot.population:last.population};
      }
    }
    const ctx = this.context;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); ctx.clearRect(0, 0, this.cssWidth, this.cssHeight);
    this.drawBackground();
    const scale = Math.min(this.cssHeight / R.worldHeight, this.cssWidth / R.worldWidth);
    const screen = (point: Point) => project(point, snapshot, this.cssWidth, this.cssHeight);
    const groundY = screen({ x: 0, y: R.groundY }).y;
    ctx.fillStyle = "#d9c397"; ctx.fillRect(0, groundY, this.cssWidth, Math.max(0, this.cssHeight - groundY));
    ctx.fillStyle = "rgba(75,89,91,.24)"; ctx.fillRect(0, groundY, this.cssWidth, 7 * scale);
    snapshot.floors.forEach((floor, index) => {
      const point = screen({ x: floor.x + floorSway(snapshot, index), y: R.groundY - (index + 1) * R.floorHeight });
      if (point.y < -R.floorHeight * scale || point.y > this.cssHeight) return;
      this.drawFloor(point.x, point.y, scale, 0, snapshot.building, snapshot.targetFloors && index === 0 ? "base" : "mid");
    });
    if (snapshot.roof) {
      const point = screen({ x: snapshot.roof.x + snapshot.swayOffset, y: R.groundY - (snapshot.floors.length + 1) * R.floorHeight });
      this.drawFloor(point.x, point.y, scale, 0, snapshot.building, "roof");
    }
    const pose = loadPose(snapshot, previous, alpha, reducedMotion);
    const rig = rigGeometry(snapshot, pose);
    if (snapshot.phase !== "ended") {
      this.drawCrane(screen(rig.pivot), scale);
      const pivot = screen(rig.pivot), eye = screen(rig.eye), tip = screen(rig.hookTip);
      ctx.save(); ctx.strokeStyle = "#263540"; ctx.lineWidth = Math.max(1.5, 3 * scale);
      ctx.beginPath(); ctx.moveTo(pivot.x, pivot.y); ctx.lineTo(eye.x, eye.y); ctx.stroke();
      this.drawHook(tip, scale);
      if (rig.attached) {
        const left = screen(rig.slingLeft), right = screen(rig.slingRight);
        ctx.strokeStyle = "#59606a"; ctx.lineWidth = Math.max(1.5, 4 * scale);
        ctx.beginPath(); ctx.moveTo(left.x, left.y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(right.x, right.y); ctx.stroke();
      }
      ctx.restore();
    }
    // The committed floor is already drawn above. Never draw a duplicate or a new load while settling.
    if (snapshot.phase !== "ended" && snapshot.phase !== "settling") {
      const point = screen(pose);
      ctx.save(); ctx.globalAlpha = snapshot.phase === "preparing" ? snapshot.loadProgress : 1;
      this.drawFloor(point.x, point.y, scale, pose.rotation, snapshot.building, snapshot.isRoof ? "roof" : snapshot.targetFloors && snapshot.floors.length === 0 ? "base" : "mid"); ctx.restore();
    }
    this.drawGhost(snapshot, scale, reducedMotion);
    this.drawImpact(snapshot,scale,reducedMotion);
    if (snapshot.lastPlacement && snapshot.feedbackRatio > 0) this.drawFeedback(snapshot, scale, reducedMotion);
    this.drawPopulation(snapshot, scale, reducedMotion);
  }
  private drawGhost(snapshot: QuickTowerSnapshot, scale: number, reducedMotion: boolean): void {
    const marker = activeGhostMarker(this.ghost, snapshot);
    if (!marker) return;
    const ctx = this.context;
    const rel = project({ x: marker.releaseX, y: marker.releaseY }, snapshot, this.cssWidth, this.cssHeight);
    const land = project({ x: marker.landingX + snapshot.swayOffset, y: marker.landingY }, snapshot, this.cssWidth, this.cssHeight);
    ctx.save();
    ctx.strokeStyle = "rgba(116, 235, 213, 0.85)";
    ctx.fillStyle = "rgba(116, 235, 213, 0.85)";
    ctx.lineWidth = Math.max(1.5, 2.5 * scale);
    ctx.beginPath();
    ctx.moveTo(rel.x - 14 * scale, rel.y);
    ctx.lineTo(rel.x + 14 * scale, rel.y);
    ctx.moveTo(rel.x, rel.y - 14 * scale);
    ctx.lineTo(rel.x, rel.y + 14 * scale);
    ctx.moveTo(land.x - 18 * scale, land.y);
    ctx.lineTo(land.x + 18 * scale, land.y);
    ctx.stroke();
    if (!reducedMotion) {
      const deltaTicks = Math.abs(marker.releaseTick - snapshot.tick);
      if (deltaTicks <= 30) {
        const pulseRadius = (10 + (1 - deltaTicks / 30) * 18) * scale;
        ctx.beginPath();
        ctx.arc(rel.x, rel.y, pulseRadius, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.font = `700 ${Math.max(10, 13 * scale)}px system-ui`;
    ctx.textAlign = "center";
    const diff = marker.releaseTick - snapshot.tick;
    const timingLabel = diff > 0 ? `GHOST -${(diff / R.tickRate).toFixed(1)}s` : diff === 0 ? "GHOST DROP" : `GHOST T${marker.releaseTick}`;
    ctx.fillText(timingLabel, rel.x, Math.max(14, rel.y - 16 * scale));
    ctx.restore();
  }
  private drawImpact(snapshot: QuickTowerSnapshot, scale: number, reducedMotion: boolean): void {
    const impact=snapshot.impact;
    if (!impact) return;
    const age=(snapshot.tick-impact.tick)/R.tickRate;
    if (age<0 || age>.4) return;
    const p=project(impact,snapshot,this.cssWidth,this.cssHeight),ctx=this.context;
    ctx.save();ctx.globalAlpha=1-age/.4;
    ctx.strokeStyle="#ffe6a3";ctx.lineWidth=Math.max(1.5,3*scale);
    ctx.beginPath();ctx.arc(p.x,p.y,(8+(reducedMotion?0:age*65))*scale,0,Math.PI*2);ctx.stroke();
    if (!reducedMotion) {
      ctx.fillStyle="#e5ccaa";
      for(let i=0;i<8;i++) {
        const direction=i*Math.PI/4;
        const distance=(6+age*(55+i%3*14))*scale;
        const size=Math.max(1.5,(5-age*8)*scale);
        ctx.fillRect(p.x+Math.cos(direction)*distance,p.y+Math.sin(direction)*distance+age*age*70*scale,size,size);
      }
    }
    ctx.restore();
  }
  private drawPopulation(snapshot: QuickTowerSnapshot, scale: number, reducedMotion: boolean): void {
    const fx=this.populationFx;if(!fx)return;
    const ctx=this.context, images=this.populationImages.get(fx.building);
    const target=project({x:fx.x+snapshot.swayOffset,y:fx.y},snapshot,this.cssWidth,this.cssHeight);
    ctx.save();ctx.textAlign="center";ctx.font=`700 ${Math.max(12,24*scale)}px system-ui`;
    ctx.fillStyle="#ffffff";ctx.strokeStyle="#24343e";ctx.lineWidth=3;
    const label=`+${fx.population} ${this.vi?"dân":"residents"}`;
    ctx.strokeText(label,target.x,target.y+45*scale);ctx.fillText(label,target.x,target.y+45*scale);
    if(!reducedMotion)for(let i=0;i<fx.count;i++) {
      const pose=parachutePose(i,fx.count,fx.elapsed);if(!pose.alpha)continue;
      const x=target.x+pose.spread*scale,y=target.y-pose.lift*scale;
      ctx.globalAlpha=pose.alpha;
      // Body 24×48 world units; canopy 72 wide. Eye joins the harness, not the head.
      if(images) {
        ctx.drawImage(images.parachute,x-40*scale,y-images.eye*scale,80*scale,60*scale);
        ctx.drawImage(images.person,x-12*scale,y-images.harness*scale,24*scale,48*scale);
      } else {
        ctx.fillStyle=BUILDINGS[fx.building].color;ctx.beginPath();ctx.ellipse(x,y-30*scale,36*scale,14*scale,0,Math.PI,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.moveTo(x-36*scale,y-30*scale);ctx.lineTo(x,y);ctx.lineTo(x+36*scale,y-30*scale);ctx.stroke();
        ctx.fillStyle="#f5d1a7";ctx.fillRect(x-6*scale,y,12*scale,24*scale);
      }
    }
    ctx.restore();
  }
  private drawBackground(): void {
    if (this.background) {
      this.context.drawImage(this.background, 0, 0, this.cssWidth, this.cssHeight); return;
    }
    const layer = document.createElement("canvas");
    layer.width = this.canvas.width; layer.height = this.canvas.height;
    const ctx = layer.getContext("2d")!;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.background = layer;
    this.paintBackground(ctx);
    this.context.drawImage(layer, 0, 0, this.cssWidth, this.cssHeight);
  }
  private paintBackground(ctx: CanvasRenderingContext2D): void {
    if (!this.images) {
      const gradient = ctx.createLinearGradient(0,0,0,this.cssHeight); gradient.addColorStop(0,"#4faae8"); gradient.addColorStop(1,"#d7efff");
      ctx.fillStyle = gradient; ctx.fillRect(0,0,this.cssWidth,this.cssHeight); return;
    }
    const image = this.images.sky, scale = Math.max(this.cssWidth / image.width, this.cssHeight / image.height);
    const width = image.width * scale, height = image.height * scale;
    ctx.drawImage(image,(this.cssWidth-width)/2,(this.cssHeight-height)/2,width,height);
  }
  private drawFloor(x: number, y: number, scale: number, rotation: number, building: BuildingId, part: "base" | "mid" | "roof"): void {
    const ctx=this.context, width=R.floorWidth*scale, height=R.floorHeight*scale;
    ctx.save(); ctx.translate(x,y+height/2); ctx.rotate(rotation);
    const { image, set } = this.buildingSprite(building,part);
    if(image) {
      // Body edges, not transparent image padding, must touch the adjacent world floor.
      const a=buildingSourceRect(building,part,set);
      const sprite=this.cachedSprite(`${building}:${set}:${part}`,image,a.x,a.y,a.width,a.height,width,height);
      ctx.drawImage(sprite,-width/2,-height/2,width,height);
    } else {
      ctx.fillStyle=BUILDINGS[building].color;ctx.strokeStyle="#263540";ctx.lineWidth=3*scale;
      ctx.fillRect(-width/2,-height/2,width,height);ctx.strokeRect(-width/2,-height/2,width,height);
    }
    ctx.restore();
  }
  private drawCrane(pivot: Point, scale: number): void {
    const craneSet = renderCosmetic(this.equipment.crane,"crane","residential").set;
    const themed = craneSet !== "default" ? this.customCranes.get(craneSet) : null;
    if(themed) {
      const a=BRICK_ANCHORS.crane,ratio=a.scale*scale;
      this.context.drawImage(this.cachedSprite(`${craneSet}-crane`,themed.rig,a.x,a.y,a.width,a.height,a.width*ratio,a.height*ratio),pivot.x-(a.pulley.x-a.x)*ratio,pivot.y-(a.pulley.y-a.y)*ratio,a.width*ratio,a.height*ratio);return;
    }
    const ctx=this.context, a=A.crane, ratio=a.scale*scale;
    const x=pivot.x-(a.pulley.x-a.x)*ratio, y=pivot.y-(a.pulley.y-a.y)*ratio;
    if(this.images) ctx.drawImage(this.cachedSprite("crane",this.images.crane,a.x,a.y,a.width,a.height,a.width*ratio,a.height*ratio),x,y,a.width*ratio,a.height*ratio);
    else { ctx.fillStyle="#deb93d";ctx.fillRect(x,pivot.y-12*scale,pivot.x-x,24*scale); }
  }
  private drawHook(tip: Point, scale: number): void {
    const craneSet = renderCosmetic(this.equipment.crane,"crane","residential").set;
    const themed = craneSet !== "default" ? this.customCranes.get(craneSet) : null;
    if(themed) {
      const a=BRICK_ANCHORS.hook,ratio=a.scale*scale, ctx=this.context;
      ctx.save();ctx.translate(tip.x,tip.y);ctx.rotate(a.rotation);
      ctx.drawImage(this.cachedSprite(`${craneSet}-hook`,themed.hook,0,0,128,128,128*ratio,128*ratio),-a.tip.x*ratio,-a.tip.y*ratio,128*ratio,128*ratio);ctx.restore();return;
    }
    const ctx=this.context, a=A.hook, ratio=a.scale*scale;
    if(this.images) ctx.drawImage(this.cachedSprite("hook",this.images.hook,0,0,128,128,128*ratio,128*ratio),tip.x-a.tip.x*ratio,tip.y-a.tip.y*ratio,128*ratio,128*ratio);
    else {ctx.beginPath();ctx.arc(tip.x,tip.y-6*scale,6*scale,0,Math.PI*1.7);ctx.stroke();}
  }
  private drawFeedback(snapshot: QuickTowerSnapshot, scale: number, reducedMotion: boolean): void {
    const quality = snapshot.lastPlacement!, ratio = snapshot.feedbackRatio;
    const roof = !!snapshot.roof || (snapshot.isRoof && snapshot.phase === "ended");
    const label = placementLabel(quality, snapshot.streak, roof, this.vi);
    const level = quality === "perfect" && !roof ? Math.min(10, snapshot.streak) : 0;
    const ctx=this.context;
    ctx.save();ctx.globalAlpha=Math.min(1,ratio*2);ctx.textAlign="center";
    const pulse = reducedMotion ? 1 : 1 + Math.sin((1-ratio)*Math.PI)*Math.min(.15,level*.025);
    const size = Math.min(this.cssWidth / Math.max(8, label.length) * 1.45, Math.max(20,34*scale)*pulse);
    ctx.font=`800 ${size}px system-ui`;ctx.lineWidth=Math.max(3,6*scale);
    ctx.strokeStyle="rgba(22,31,40,.72)";ctx.fillStyle=quality==="miss"?"#ff6b6b":quality==="perfect"?"#ffdb6c":"#ffffff";
    const x=this.cssWidth/2, y=this.cssHeight*.22;
    ctx.strokeText(label,x,y); ctx.fillText(label,x,y);
    if (level >= 2 && !reducedMotion) {
      // Deterministic, capped particles; no DOM animation, blur, allocation or screen shake.
      const count=Math.min(24,6+level*2), progress=1-ratio;
      for(let i=0;i<count;i++) {
        const angle=i*Math.PI*2/count, distance=(18+progress*(35+level*3))*scale;
        ctx.fillRect(x+Math.cos(angle)*distance,y-10*scale+Math.sin(angle)*distance,Math.max(2,4*scale),Math.max(2,4*scale));
      }
    }
    ctx.restore();
  }
}
