import { QUICK_TOWER_RULES as R, type QuickTowerSnapshot } from "../../city-bloxx-core/src/index";
export interface Point { x: number; y: number }
export interface LoadPose extends Point { rotation: number }
export const EMPTY_CABLE_LENGTH = R.emptyCableLength;
export const SPRITE_ANCHORS = Object.freeze({
  // Source PNG coordinates; transparent canvas padding is not part of the body.
  floor: { x: 128, y: 64, width: 256, height: 128 },
  crane: { x: 14, y: 9, width: 995, height: 210, pulley: { x: 924, y: 159 }, scale: .4 },
  hook: { eye: { x: 64, y: 9 }, tip: { x: 61, y: 119 }, scale: .5 },
});
export function loadPose(snapshot: QuickTowerSnapshot, previous?: QuickTowerSnapshot, alpha = 1, reducedMotion = false): LoadPose {
  const interpolate = previous && previous.phase === snapshot.phase && previous.floors.length === snapshot.floors.length;
  // Essential swing/fall position must stay smooth and match the fraction captured by drop().
  // Reduced motion removes decorative rotation/effects, not interpolation of the aiming target.
  const t = Math.round(Math.max(0, Math.min(1, alpha)) * 1000) / 1000;
  const pose = interpolate ? {
    x: previous.current.x + (snapshot.current.x - previous.current.x) * t,
    y: previous.current.y + (snapshot.current.y - previous.current.y) * t,
    rotation: previous.current.rotation + (snapshot.current.rotation - previous.current.rotation) * t,
  } : { ...snapshot.current };
  if (snapshot.phase === "preparing") {
    const progress = snapshot.loadProgress;
    const ease = 1 - (1 - progress) ** 2;
    const {cableLength,emptyCableLength} = snapshot.difficulty;
    const length = emptyCableLength + (cableLength - emptyCableLength) * ease;
    const displacement = (pose.x - snapshot.crane.x) * ease * length / cableLength;
    pose.x = snapshot.crane.x + displacement;
    pose.y = snapshot.crane.y + Math.sqrt(Math.max(0, length ** 2 - displacement ** 2)) + R.hookToRoof;
    pose.rotation *= ease;
  }
  if (reducedMotion) pose.rotation = 0;
  return pose;
}
export function roofPoint(pose: LoadPose, localX: number): Point {
  const y = -R.floorHeight / 2;
  const cos = Math.cos(pose.rotation), sin = Math.sin(pose.rotation);
  return { x: pose.x + localX * cos - y * sin, y: pose.y + R.floorHeight / 2 + localX * sin + y * cos };
}
export function rigGeometry(snapshot: QuickTowerSnapshot, pose: LoadPose) {
  const roof = roofPoint(pose, 0);
  const hookTip = { x: roof.x, y: roof.y - 28 };
  const attached = snapshot.phase === "swing" || snapshot.phase === "preparing";
  if (!attached) {
    const release = snapshot.released;
    const tick = snapshot.drops[snapshot.drops.length - 1]?.tick ?? snapshot.tick;
    const retractTicks = snapshot.difficulty.emptyCableLength === R.emptyCableLength ? R.retractTicks : 30;
    const t = Math.min(1, Math.max(0, (snapshot.tick - tick) / retractTicks));
    const ease = 1 - (1 - t) ** 3;
    const hook = SPRITE_ANCHORS.hook;
    const eyeOffsetX = (hook.eye.x - hook.tip.x) * hook.scale;
    const eyeToTip = (hook.tip.y - hook.eye.y) * hook.scale;
    hookTip.x = release.x + (snapshot.crane.x - eyeOffsetX - release.x) * ease;
    hookTip.y = release.y - 28 + (snapshot.crane.y + snapshot.difficulty.emptyCableLength + eyeToTip - (release.y - 28)) * ease;
  }
  const hook = SPRITE_ANCHORS.hook;
  const eye = { x: hookTip.x + (hook.eye.x - hook.tip.x) * hook.scale, y: hookTip.y + (hook.eye.y - hook.tip.y) * hook.scale };
  return { pivot: snapshot.crane, hookTip, eye, attached,
    slingLeft: roofPoint(pose, -R.floorWidth * .36), slingRight: roofPoint(pose, R.floorWidth * .36) };
}
export function project(point: Point, snapshot: QuickTowerSnapshot, width: number, height: number): Point {
  const scale = Math.min(height / R.worldHeight, width / R.worldWidth);
  return { x: width / 2 + (point.x - snapshot.camera.x) * scale,
    y: (height - R.worldHeight * scale) / 2 + (point.y + snapshot.camera.lift) * scale };
}
