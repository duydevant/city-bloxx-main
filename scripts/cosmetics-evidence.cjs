const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),crypto=require("node:crypto"),Module=require("node:module");
const root=path.resolve(__dirname,".."),requireWeb=Module.createRequire(path.join(root,"base-game-nextjs/package.json")),sharp=requireWeb("sharp"),esbuild=Module.createRequire(path.join(root,"base-playable-main/package.json"))("esbuild");
function bundle(file){const code=esbuild.buildSync({entryPoints:[path.join(root,file)],bundle:true,platform:"node",format:"cjs",write:false}).outputFiles[0].text,m=new Module(file,module);m._compile(code,file);return m.exports;}
const c=bundle("packages/city-bloxx-core/src/index.ts"),catalog=bundle("packages/city-bloxx-content/cosmetics.ts");
async function main(){
  const manifest=JSON.parse(fs.readFileSync(path.join(root,"packages/city-bloxx-content/assets.manifest.json"),"utf8")),assets=manifest.assets.filter(a=>a.path.includes("/brick/"));
  assert.equal(assets.length,19);let packBytes=0;const qa=[];
  for(const asset of assets){
    const file=path.join(root,"art/approved",asset.path),buffer=fs.readFileSync(file);assert.equal(crypto.createHash("sha256").update(buffer).digest("hex"),asset.sha256);
    for(const target of ["base-game-nextjs/public/game","base-playable-main/public/game"])assert.deepEqual(fs.readFileSync(path.join(root,target,asset.path)),buffer);
    packBytes+=buffer.length;if(asset.path.endsWith(".svg"))continue;
    const {data,info}=await sharp(buffer).ensureAlpha().raw().toBuffer({resolveWithObject:true});assert.equal(info.width,asset.width);assert.equal(info.height,asset.height);
    const bounds=asset.path.startsWith("stack/")?[160,48,352,208]:asset.path.startsWith("city/")?[32,64,224,320]:asset.path.includes("_rig_")?[64,96,960,416]:[40,16,88,112];
    let visible=0;for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){const alpha=data[(y*info.width+x)*4+3];if(alpha)visible++;if(x<bounds[0]||x>=bounds[2]||y<bounds[1]||y>=bounds[3])assert.equal(alpha,0,`${asset.path}: outside alpha ${x},${y}`);}
    assert(visible>0);
    if(asset.path.startsWith("stack/")&&!asset.path.includes("_roof"))for(let x=160;x<352;x++){assert.equal(data[(48*info.width+x)*4+3],255,"top seam");assert.equal(data[(207*info.width+x)*4+3],255,"bottom seam");}
    qa.push({path:asset.path,dimensions:[info.width,info.height],bounds,alphaOutside:0});
  }
  assert(packBytes<=3*1048576);
  const out=path.join(root,"tmp/c4-cosmetics-qa");fs.mkdirSync(out,{recursive:true});
  const composites=[];for(let col=0;col<4;col++){const id=c.BUILDING_IDS[col];for(let floor=0;floor<20;floor++){const part=floor===0?"base":"mid",input=await sharp(path.join(root,`art/approved/stack/brick/bldg_${id}_brick_${part}.png`)).extract({left:160,top:48,width:192,height:160}).toBuffer();composites.push({input,left:col*224+16,top:160+(19-floor)*160});}}
  await sharp({create:{width:896,height:3360,channels:4,background:"#526478"}}).composite(composites).png().toFile(path.join(out,"twenty-floor-seams.png"));
  let save=c.migrateSave(JSON.parse(fs.readFileSync(path.join(root,"tmp/c4-qa/save-after-70-runs.json"),"utf8")));
  for(const id of c.BUILDING_IDS){save.progression.counts.classes[id]=20;const t=save.stats.byClass[id];t.quality.perfect=Math.max(50,t.quality.perfect);t.scoredBody=Object.values(t.quality).reduce((n,v)=>n+v,0);t.errorCount=t.scoredBody;t.landedBody=t.scoredBody-t.quality.miss;}
  save.daily.lifetimeCreditedDays=7;save=c.grantCosmetics(save,1791547200000);
  assert.equal(save.inventory.grants.length,10);const before=save.progression.xp;assert.equal(c.grantCosmetics(save,1791547201000),save);assert.equal(save.progression.xp,before);
  for(const id of c.BUILDING_IDS){save=c.equipCosmetic(save,`brick-building-${id}`,id);save=c.equipCosmetic(save,`brick-roof-${id}`,id);}save=c.equipCosmetic(save,"brick-crane","residential");
  save=c.prepareSave(save);assert.deepEqual(c.migrateSave(save),save);assert.equal(save.history.length,50);assert(save.city.pending);
  const json=JSON.stringify(save),envelope=JSON.stringify({v:1,d:save}),capacity={utf8:Buffer.byteLength(json),utf16:json.length*2,envelopeUtf8:Buffer.byteLength(envelope),envelopeUtf16:envelope.length*2};assert(Math.max(...Object.values(capacity))<=c.SAVE_BUDGET_BYTES);
  fs.writeFileSync(path.join(out,"capacity-save.json"),JSON.stringify(save,null,2));
  const browser=JSON.parse(fs.readFileSync(path.join(root,"tmp/c0-c2-qa/browser-report.json"),"utf8"));assert.equal(browser.length,2);for(const platform of browser){assert.equal(platform.tracking.cosmetics.brickOwnership,10);assert.equal(platform.tracking.cosmetics.cache.imageDraws,0);}
  const sourceFiles=["packages/city-bloxx-content/cosmetics.ts","packages/city-bloxx-content/assets.manifest.json","packages/city-bloxx-core/src/cosmetics.ts","packages/city-bloxx-core/src/city.ts","packages/city-bloxx-core/src/save-state.ts","packages/city-bloxx-core/src/tracking.ts","packages/city-bloxx-core/src/index.ts","packages/city-bloxx-renderer/src/index.ts","packages/city-bloxx-renderer/src/sprites.ts","packages/city-bloxx-renderer/src/book-screens.ts","packages/city-bloxx-renderer/src/session.ts","packages/city-bloxx-renderer/src/session.css","packages/city-bloxx-renderer/src/progression-screens.ts","base-game-nextjs/modules/city-bloxx/cosmetics.test.ts","scripts/import-brick-assets.cjs","scripts/browser-smoke.cjs","scripts/check-game-assets.cjs","scripts/cosmetics-evidence.cjs","art/qa/brick-import.json"];
  const hash=crypto.createHash("sha256");for(const file of sourceFiles)hash.update(`${file}\n${fs.readFileSync(path.join(root,file),"utf8").replace(/\r\n/g,"\n")}`);
  const report={phase:"C4.3",date:"2026-10-12",status:"Implemented",commitTitle:"feat(c4.3): complete Classic Brick cosmetics and Architecture Book",sourceFiles,sourceSHA256:hash.digest("hex"),commands:["npm.cmd run check","npm.cmd run test:browser","npm.cmd run test:save","npm.cmd run test:daily","npm.cmd run test:cosmetics"],unitTests:{total:228,files:17,cosmetics:13},catalogVersion:"cosmetics-1",catalogItems:catalog.COSMETIC_CATALOG.length,art:{generator:"built-in image_gen",promptSpec:"plan/12-art-requirements.md",provenance:"art/source/brick-prompts.md",sourceRoot:"art/source",approvedRoot:"art/approved",gameplayPNG:18,codeBadge:1,packBytes,approvedAssets:manifest.assets.length,qa,normalization:"subject alpha threshold/canonical facade backing and crop; originals retained"},capacity:{...capacity,history:50,cosmeticGrants:10,legacyCityPendingPreserved:true,fixture:"70 simulated settlements plus seeded validated lifetime cosmetic milestones; not a manual playthrough"},browser:browser.map(p=>({platform:p.platform,...p.tracking.cosmetics})),boundaries:"Physics/scoring unchanged. Guest/SDK cosmetic ownership is local. Headless preview/cache checks are not real-phone FPS, actual host certification or release. Historical C4.0/C4.1/C4.2 evidence is preserved."};
  fs.writeFileSync(path.join(root,"plan/evidence/C4.3-validation.json"),JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report,null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
