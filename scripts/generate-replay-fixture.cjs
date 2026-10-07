const path = require("node:path");
const esbuild = require("node:module").createRequire(path.resolve(__dirname,"../base-playable-main/package.json"))("esbuild");
const output = esbuild.buildSync({ entryPoints: [path.join(__dirname,"../packages/city-bloxx-core/src/index.ts")], bundle:true, platform:"node", format:"cjs", write:false });
const compiled = {exports:{}};
new Function("module", "exports", output.outputFiles[0].text)(compiled, compiled.exports);
const { QuickTowerGame, floorSway } = compiled.exports;
const game = new QuickTowerGame(42);
function until(check) { for(let i=0;i<3000;i++){if(check())return;game.advanceTicks(1);}throw new Error("Fixture tick limit"); }
function place(offset=0) {
  until(()=>{const s=game.getSnapshot(),x=s.floors.length?s.floors[s.floors.length-1].x+floorSway(s,s.floors.length-1):0;return s.phase==="swing"&&Math.abs(s.current.x-x-offset)<(offset===0?1:5);});
  const id=game.getSnapshot().feedbackId;game.drop(0);until(()=>game.getSnapshot().feedbackId>id);
}
place();place();game.advanceTicks(220);
for(let i=0;i<6;i++)place(30);
for(let i=0;i<30 && game.getPhase()!=="ended";i++) {
  until(()=>{const s=game.getSnapshot(),x=s.floors.length?s.floors[s.floors.length-1].x+floorSway(s,s.floors.length-1):0;return s.phase==="swing"&&Math.abs(s.current.x-x)>115;});
  game.drop(0);until(()=>["swing","ended"].includes(game.getSnapshot().phase));
}
console.log(JSON.stringify(game.getRecord(),null,2));
