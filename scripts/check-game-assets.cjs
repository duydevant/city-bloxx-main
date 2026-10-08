const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const manifest = require("../packages/city-bloxx-content/assets.manifest.json");
for (const target of ["web", "playable"]) {
  const base = path.join(root, target === "web" ? "base-game-nextjs" : "base-playable-main", "public", "game");
  let bytes = 0;
  for (const asset of manifest.assets.filter(a => a.targets.includes(target))) {
    const file = path.join(base, asset.path);
    if (!fs.existsSync(file)) throw new Error(`Missing ${target} asset: ${asset.path}`);
    const data = fs.readFileSync(file);
    const width = data.readUInt32BE(16), height = data.readUInt32BE(20);
    if (width !== asset.width || height !== asset.height) throw new Error(`Wrong dimensions: ${target}/${asset.path}`);
    if (data.length > manifest.budget.maxFileBytes) throw new Error(`Asset exceeds budget: ${asset.path}`);
    if (crypto.createHash("sha256").update(data).digest("hex") !== asset.sha256) throw new Error(`Asset differs from approved manifest: ${target}/${asset.path}`);
    bytes += data.length;
  }
  if (bytes > manifest.budget.totalBytes) throw new Error(`${target} assets exceed total budget`);
  console.log(`${target}: ${manifest.assets.length} approved assets, ${(bytes / 1048576).toFixed(2)} MiB`);
}
const core = path.join(root, "packages", "city-bloxx-core", "src");
function sourceFiles(dir) {
  return fs.readdirSync(dir, {withFileTypes:true}).flatMap(entry=>entry.isDirectory()?sourceFiles(path.join(dir,entry.name)):entry.name.endsWith(".ts")?[path.join(dir,entry.name)]:[]);
}
for (const file of sourceFiles(core)) {
  if (/\b(?:window|document|fetch|Date\.now|Math\.random)\b/.test(fs.readFileSync(file,"utf8"))) throw new Error(`Platform dependency in core: ${path.relative(core,file)}`);
}
const esbuild = require("node:module").createRequire(path.join(root,"base-playable-main","package.json"))("esbuild");
const graph = esbuild.buildSync({entryPoints:[path.join(root,"base-playable-main/src/game/index.ts")],bundle:true,platform:"browser",format:"esm",metafile:true,write:false,outdir:path.join(root,"tmp","boundary-check")}).metafile;
if (Object.keys(graph.inputs).some(file=>/(?:^|[/\\])base-game-nextjs[/\\]|(?:^|[/\\])server[/\\]/.test(file))) throw new Error("Web/backend dependency leaked into Playable game");
console.log("Shared core has no DOM, network or wall-clock dependency.");
console.log("Playable game dependency graph excludes Web/backend modules.");
