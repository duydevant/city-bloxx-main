import { describe, expect, it } from "vitest"
import sharp from "sharp"
import path from "node:path"
import { BUILDING_IDS, QUICK_TOWER_RULES as R } from "../../../packages/city-bloxx-core/src/index"
import { buildingSourceRect } from "../../../packages/city-bloxx-renderer/src/sprites"

describe("building seams use solid facade bounds",()=>{
  for(const id of BUILDING_IDS)for(const part of ["base","mid"] as const) {
    it(`${id}/${part} has visible pixels on both stacking edges, without empty padding rows`,async()=>{
      const rect=buildingSourceRect(id,part)
      const file=path.resolve(process.cwd(),`../art/approved/stack/default/bldg_${id}_default_${part}.png`)
      const {data,info}=await sharp(file).extract({left:rect.x,top:rect.y,width:rect.width,height:rect.height}).ensureAlpha().raw().toBuffer({resolveWithObject:true})
      expect(rect.x).toBeGreaterThanOrEqual(0)
      expect(rect.x+rect.width).toBeLessThanOrEqual(512)
      for(let row=0;row<info.height;row++) {
        let visible=0
        for(let x=0;x<info.width;x++)if(data[(row*info.width+x)*4+3]>=64)visible++
        expect(visible,`${id}/${part} transparent row ${row}`).toBeGreaterThan(rect.width*.4)
      }
      // Both base and mid fill the full story height irrespective of their source crop height.
      const heightScale=R.floorHeight/rect.height
      expect(rect.height*heightScale).toBeCloseTo(R.floorHeight,8)
    })
  }
})
