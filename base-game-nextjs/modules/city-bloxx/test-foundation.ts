import { QuickTowerGame } from "../../../packages/city-bloxx-core/src/index"
export function foundation(game:QuickTowerGame) {
  game.drop(0)
  for(let i=0;i<300&&game.getSnapshot().floors.length===0;i++)game.advanceTicks(1)
  if(game.getSnapshot().floors.length!==1)throw new Error("Foundation missing")
}
