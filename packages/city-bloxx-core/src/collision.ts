import { QUICK_TOWER_RULES as R } from "./rules";

export interface LoadPosition { x: number; y: number }
export interface TowerContact {
  time: number; floorIndex: number; normalX: number; normalY: number;
  x: number; y: number; floorX: number;
}

// Swept facade boxes: rotation is cosmetic, matching the gameplay's 144x120 hitbox.
// Relative motion includes tower sway. Exact edge-only contact (100% displacement)
// has no overlapping area and cannot stop a vertical fall.
export function sweepTower(from: LoadPosition, to: LoadPosition, floors: readonly {x:number}[], previousSway: number, nextSway: number): TowerContact | null {
  const result: {first: TowerContact | null} = {first:null};
  const dy = to.y - from.y;
  for (let index = floors.length - 1; index >= 0; index--) {
    const weight = Math.max(0,Math.min(1,index/R.swayBuildFloors));
    const beforeX = floors[index].x + previousSway*weight;
    const afterX = floors[index].x + nextSway*weight;
    const x = from.x-beforeX, dx = to.x-afterX-x;
    const top = R.groundY-(index+1)*R.floorHeight;
    const y = from.y-top;
    const face = (time: number, normalX: number, normalY: number) => {
      if (time < 0 || time > 1 || (result.first && time >= result.first.time)) return;
      const hitX=x+dx*time, hitY=y+dy*time;
      if (normalY ? Math.abs(hitX)>=R.floorWidth : hitY<=-R.floorHeight || hitY>=R.floorHeight) return;
      const center=beforeX+(afterX-beforeX)*time, loadX=from.x+(to.x-from.x)*time;
      const left=Math.max(center-R.floorWidth/2,loadX-R.floorWidth/2);
      const right=Math.min(center+R.floorWidth/2,loadX+R.floorWidth/2);
      result.first={time,floorIndex:index,normalX,normalY,floorX:afterX,
        x:normalY?(left+right)/2:center+normalX*R.floorWidth/2,
        y:normalY<0?top:normalY>0?top+R.floorHeight:from.y+dy*time+R.floorHeight/2};
    };
    if (dy>0 && y<=-R.floorHeight) face((-R.floorHeight-y)/dy,0,-1);
    if (dy<0 && y>=R.floorHeight) face((R.floorHeight-y)/dy,0,1);
    if (dx>0 && x<=-R.floorWidth) face((-R.floorWidth-x)/dx,-1,0);
    if (dx<0 && x>=R.floorWidth) face((R.floorWidth-x)/dx,1,0);
  }
  if (dy>0 && from.y+R.floorHeight<=R.groundY && to.y+R.floorHeight>=R.groundY) {
    const time=(R.groundY-R.floorHeight-from.y)/dy;
    if (!result.first || time<result.first.time) result.first={time,floorIndex:-1,normalX:0,normalY:-1,
      x:from.x+(to.x-from.x)*time,y:R.groundY,floorX:0};
  }
  return result.first;
}
