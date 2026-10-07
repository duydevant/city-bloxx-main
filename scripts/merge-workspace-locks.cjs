// Mechanical migration of the two existing npm lockfiles; no dependency upgrades.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname,"..");
const pkg = JSON.parse(fs.readFileSync(path.join(root,"package.json"),"utf8"));
const packages = { "": {name:pkg.name,version:pkg.version,workspaces:pkg.workspaces} };
for(const app of ["base-game-nextjs","base-playable-main"]) {
  const lock = JSON.parse(fs.readFileSync(path.join(root,app,"package-lock.json"),"utf8"));
  for(const [key,value] of Object.entries(lock.packages)) packages[key ? `${app}/${key}` : app] = value;
  packages[`node_modules/${lock.name}`] = {resolved:app,link:true};
}
for(const name of fs.readdirSync(path.join(root,"packages"))) {
  const dir=`packages/${name}`;
  const p=JSON.parse(fs.readFileSync(path.join(root,dir,"package.json"),"utf8"));
  packages[dir]={name:p.name,version:p.version};
  packages[`node_modules/${p.name}`]={resolved:dir,link:true};
}
fs.writeFileSync(path.join(root,"package-lock.json"),JSON.stringify({name:pkg.name,version:pkg.version,lockfileVersion:3,requires:true,packages},null,2)+"\n");
console.log("Migrated existing pinned dependencies into the root workspace lock; original app locks retained as migration references.");
