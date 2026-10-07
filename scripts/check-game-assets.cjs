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
for (const file of fs.readdirSync(core).filter(f => f.endsWith(".ts"))) {
  if (/\b(?:window|document|fetch|Date\.now|Math\.random)\b/.test(fs.readFileSync(path.join(core,file),"utf8"))) throw new Error(`Platform dependency in core: ${file}`);
}
console.log("Shared core has no DOM, network or wall-clock dependency.");
