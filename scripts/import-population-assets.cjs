// Copies original approved PNGs unchanged; no generative art or destructive export.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "packages/city-bloxx-content/assets.manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const directory = path.join(root, "art/approved/fx/population/default");
for (const name of fs.readdirSync(directory).filter(name => /^(person|parachute)_(residential|industrial|office|highrise)_default_(fall|open)_v001\.png$/.test(name))) {
  const source = path.join(directory, name), buffer = fs.readFileSync(source);
  const relative = `fx/population/default/${name.replace("_v001", "")}`;
  for (const app of ["base-game-nextjs", "base-playable-main"]) {
    const destination = path.join(root, app, "public/game", relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(source, destination);
  }
  const asset = { path: relative, width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20), bytes: buffer.length,
    sha256: crypto.createHash("sha256").update(buffer).digest("hex"), targets: ["web", "playable"] };
  manifest.assets = manifest.assets.filter(item => item.path !== relative); manifest.assets.push(asset);
  console.log(relative, asset.width, asset.height, asset.bytes);
}
// Mechanical manifest regeneration from imported file metadata.
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
