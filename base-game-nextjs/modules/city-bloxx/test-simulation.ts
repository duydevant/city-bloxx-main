import { floorSway, QuickTowerGame } from "../../../packages/city-bloxx-core/src/index"

// Test bot forecasts the moving landing surface, rather than aiming at its release-time position.
// It uses only public config/recorded inputs and the same simulation; no game state is edited.
function trialLanding(game: QuickTowerGame) {
  const state=game.getSnapshot(), trial=new QuickTowerGame(game.config)
  for(const input of state.drops) {
    trial.advanceTicks(input.tick-trial.getTick())
    if(!trial.drop(input.fraction/1000))throw new Error("Test bot replay rejected")
  }
  trial.advanceTicks(state.tick-trial.getTick())
  trial.drop(0)
  for(let tick=0;tick<200&&trial.getSnapshot().feedbackId===state.feedbackId;tick++)trial.advanceTicks(1)
  return trial.getSnapshot()
}
export function placeAccurately(game: QuickTowerGame, maximumError = .1) {
  const feedback=game.getSnapshot().feedbackId
  for(let tick=0;tick<4000;tick++) {
    const state=game.getSnapshot(),index=state.floors.length-1
    const top=index>=0?state.floors[index].x+floorSway(state,index):0
    if(state.phase==="swing"&&Math.abs(state.current.x-top)<80) {
      const trial=trialLanding(game), landing=state.isRoof?trial.roof:trial.floors[state.floors.length]
      if(landing&&landing.error<=maximumError) {
        if(!game.drop(0))throw new Error("Test bot drop rejected")
        for(let step=0;step<200&&game.getSnapshot().feedbackId===feedback;step++)game.advanceTicks(1)
        if(game.getSnapshot().feedbackId===feedback)throw new Error("Test bot landing limit")
        return
      }
    }
    game.advanceTicks(1)
  }
  throw new Error("Test bot could not find a safe landing")
}
