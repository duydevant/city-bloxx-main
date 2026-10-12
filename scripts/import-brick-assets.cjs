// Explicit opt-in importer. Never touches Default/compact-v3 or the legacy exporter.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("node:module").createRequire(path.resolve(__dirname,"../base-game-nextjs/package.json"))("sharp");
const root = path.resolve(__dirname,"..");
const manifestPath = path.join(root,"packages/city-bloxx-content/assets.manifest.json");
const classes = ["residential","industrial","office","highrise"];
function newest(branch,id) {
  const dir=path.join(root,"art/source",branch,"brick");
  const files=fs.readdirSync(dir).filter(f=>new RegExp(`^${id}_v[0-9]{3}\\.png$`).test(f)).sort();
  if(!files.length)throw new Error(`Missing source: ${id}`);
  return path.join(dir,files[files.length-1]);
}
async function cutout(file) {
  const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let x0=info.width,y0=info.height,x1=-1,y1=-1;
  // Generated source can have translucent halo pixels; approved sprites retain the solid subject only.
  for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
    const offset=(y*info.width+x)*4;
    if(data[offset+3]<241)data[offset+3]=0;
    else {x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  }
  if(x1<x0)throw new Error(`Empty source: ${file}`);
  const crop={left:x0,top:y0,width:x1-x0+1,height:y1-y0+1};
  return {buffer:await sharp(data,{raw:info}).extract(crop).png().toBuffer(),crop,source:path.relative(root,file).replace(/\\/g,"/")};
}
async function main() {
  const manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
  const before=manifest.assets.filter(a=>!a.path.includes("/brick/"));
  const imported=[],qa=[];
  async function write(relative,buffer,width,height,source) {
    if(!relative.includes("/brick/"))throw new Error("Only Brick imports are allowed");
    const limit=relative.startsWith("rig/")&&relative.includes("_rig_")?262144:relative.includes("_hook_")||relative.endsWith(".svg")?32768:131072;
    if(buffer.length>limit)throw new Error(`Brick asset exceeds budget: ${relative}`);
    for(const base of ["art/approved","base-game-nextjs/public/game","base-playable-main/public/game"]){const file=path.join(root,base,relative);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,buffer);}
    imported.push({path:relative,width,height,bytes:buffer.length,sha256:crypto.createHash("sha256").update(buffer).digest("hex"),targets:["web","playable"]});
    qa.push({path:relative,source:source?.source??"code-native badge",sourceCrop:source?.crop??null,width,height,bytes:buffer.length});
  }
  for(const id of classes)for(const part of ["base","mid","roof"]){
    const s=await cutout(newest("stack",`bldg_${id}_brick_${part}`));
    let body=await sharp(s.buffer).resize(192,160,{fit:part==="roof"?"inside":"fill"}).png().toBuffer();
    let meta=await sharp(body).metadata();
    if(part!=="roof") {body=await sharp({create:{width:192,height:160,channels:4,background:{r:222,g:190,b:145,alpha:1}}}).composite([{input:body}]).png().toBuffer();meta=await sharp(body).metadata();}
    const buffer=await sharp({create:{width:512,height:256,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:body,left:Math.floor((512-meta.width)/2),top:208-meta.height}]).png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
    await write(`stack/brick/bldg_${id}_brick_${part}.png`,buffer,512,256,s);
  }
  for(const id of classes){
    const s=await cutout(newest("city",`city_${id}_brick_mini`));
    const {data,info}=await sharp(s.buffer).resize(192,256,{fit:"inside"}).png().toBuffer({resolveWithObject:true});
    const buffer=await sharp({create:{width:256,height:384,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:data,left:Math.floor((256-info.width)/2),top:320-info.height}]).png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
    await write(`city/brick/city_${id}_brick_mini.png`,buffer,256,384,s);
  }
  for(const part of ["rig","hook"]){
    const s=await cutout(newest("rig",`crane_${part}_brick_sprite`));
    const width=part==="rig"?1024:128,height=part==="rig"?512:128,cw=part==="rig"?896:48,ch=part==="rig"?320:96,bottom=part==="rig"?416:112;
    const {data,info}=await sharp(s.buffer).resize(cw,ch,{fit:"inside"}).png().toBuffer({resolveWithObject:true});
    const buffer=await sharp({create:{width,height,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).composite([{input:data,left:Math.floor((width-info.width)/2),top:bottom-info.height}]).png({compressionLevel:9,adaptiveFiltering:true}).toBuffer();
    await write(`rig/brick/crane_${part}_brick_sprite.png`,buffer,width,height,s);
  }
  const badge=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><circle cx="128" cy="128" r="94" fill="#ecd17e" stroke="#8e642f" stroke-width="4"/><path d="M82 195V83h92v112Z" fill="#bd7750" stroke="#553d30" stroke-width="4"/><path d="M77 82l51-27 51 27Z" fill="#efe5c6"/><path d="M100 95h18v22h-18Z" fill="#4b91d1"/><path d="M138 95h18v22h-18Z" fill="#c45b4e"/><path d="M100 130h18v22h-18Z" fill="#4b9d89"/><path d="M138 130h18v22h-18Z" fill="#d9b34c"/><path d="M117 170h22v25h-22Z" fill="#38434d"/></svg>');
  await write("ui/brick/collection-badge.svg",badge,256,256);
  const packBytes=imported.reduce((n,a)=>n+a.bytes,0);if(packBytes>3*1048576)throw new Error("Brick pack exceeds 3 MiB");
  manifest.assets=[...before,...imported];fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+"\n");
  fs.mkdirSync(path.join(root,"art/qa"),{recursive:true});fs.writeFileSync(path.join(root,"art/qa/brick-import.json"),JSON.stringify({version:"brick-art-1",generator:"built-in image_gen",promptSpec:"plan/12-art-requirements.md",normalization:"solid alpha cutout; opaque rectangular body; canonical approved crop/anchor; Default source untouched",packBytes,assets:qa},null,2)+"\n");
  console.log(JSON.stringify({files:imported.length,packBytes,defaultAssetsPreserved:before.length}));
}
main().catch(e=>{console.error(e);process.exitCode=1});
