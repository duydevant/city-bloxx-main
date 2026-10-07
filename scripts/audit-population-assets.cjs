const fs=require("node:fs"),path=require("node:path");
const sharp=require("node:module").createRequire(path.resolve(__dirname,"../base-game-nextjs/package.json"))("sharp");
(async()=>{
  const dir=path.resolve(__dirname,"../art/approved/fx/population/default");
  for(const name of fs.readdirSync(dir).filter(name=>name.endsWith(".png"))) {
    const file=path.join(dir,name),metadata=await sharp(file).metadata(),stats=await sharp(file).stats();
    console.log(name,JSON.stringify({width:metadata.width,height:metadata.height,hasAlpha:metadata.hasAlpha,isOpaque:stats.isOpaque,alpha:stats.channels[3]}));
  }
})();
