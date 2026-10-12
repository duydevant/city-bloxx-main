import { describe,it,expect } from "vitest";
import { emptySave,migrateSave,prepareSave } from "../../../packages/city-bloxx-core/src/index";
import { completeTutorial } from "../../../packages/city-bloxx-core/src/save-state";
describe("W0 tutorial persistence",()=>{
  it("keeps independent new-player flags without affecting stats or XP",()=>{
    const s=emptySave(),next=completeTutorial(s,"city");
    expect(next.tutorials).toEqual({quick:false,city:true,daily:false});expect(s.tutorials.city).toBe(false);
    expect(next.stats).toBe(s.stats);expect(next.progression).toBe(s.progression);
    expect(completeTutorial(next,"city")).toBe(next);expect(migrateSave(prepareSave(next)).tutorials).toEqual(next.tutorials);
  });
  it("does not require existing schema 1–4 players to repeat tutorials",()=>{
    for(const schema of [1,2,3,4]){const old={...emptySave(),schema,tutorials:undefined};expect(migrateSave(old).tutorials).toEqual({quick:true,city:true,daily:true});}
  });
  it("rejects malformed flags and leaves original save intact",()=>{
    const old={...emptySave(),tutorials:{quick:"yes",city:true,daily:false}};const raw=JSON.stringify(old);
    expect(()=>migrateSave(old)).toThrow();expect(JSON.stringify(old)).toBe(raw);
  });
});
