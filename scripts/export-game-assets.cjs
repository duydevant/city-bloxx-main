const fs = require("node:fs");
const path = require("node:path");
const sharp = require("node:module").createRequire(require("node:path").resolve(__dirname,"../base-game-nextjs/package.json"))("sharp");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "art", "source");
const approved = path.join(root, "art", "approved");
const targets = [
  path.join(root, "base-game-nextjs", "public", "game"),
  path.join(root, "base-playable-main", "public", "game"),
];

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

async function writeAll(buffer, relativePath) {
  const destinations = [path.join(approved, relativePath), ...targets.map((target) => path.join(target, relativePath))];
  for (const destination of destinations) {
    ensureDir(destination);
    fs.writeFileSync(destination, buffer);
  }
}

async function resizeSource(input, width, height, fit = "fill") {
  return sharp(input)
    .resize(width, height, { fit, position: "centre" })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function removeWhite(input) {
  const { data, info } = await sharp(input).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const output = Buffer.alloc(info.width * info.height * 4);
  for (let pixel = 0; pixel < info.width * info.height; pixel += 1) {
    const sourceOffset = pixel * info.channels;
    const outputOffset = pixel * 4;
    const r = data[sourceOffset];
    const g = data[sourceOffset + 1];
    const b = data[sourceOffset + 2];
    const distance = Math.max(255 - r, 255 - g, 255 - b);
    const alpha = Math.max(0, Math.min(255, (distance - 4) * 7));
    output[outputOffset] = r;
    output[outputOffset + 1] = g;
    output[outputOffset + 2] = b;
    output[outputOffset + 3] = alpha;
  }
  return sharp(output, { raw: { width: info.width, height: info.height, channels: 4 } });
}

async function normalizeTransparent(input, width, height, contentWidth, contentHeight, anchorY) {
  const { data, info } = await sharp(input)
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(contentWidth, contentHeight, { fit: "inside", withoutEnlargement: false })
    .png()
    .toBuffer({ resolveWithObject: true });
  const left = Math.floor((width - info.width) / 2);
  const top = Math.max(0, anchorY - info.height);
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: data, left, top }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

async function exportStack() {
  const dir = path.join(source, "stack", "default");
  const files = fs.readdirSync(dir).filter((file) => file.endsWith("_v001.png"));
  for (const file of files) {
    const name = file.replace("_v001.png", ".png");
    const buffer = await resizeSource(path.join(dir, file), 512, 256);
    await writeAll(buffer, path.join("stack", "default", name));
  }
}

async function exportCity() {
  const dir = path.join(source, "city", "default");
  const heights = {
    "city_residential_default_mini_v001.png": 230,
    "city_industrial_default_mini_v001.png": 238,
    "city_office_default_mini_v001.png": 270,
    "city_highrise_default_mini_v001.png": 306,
  };
  for (const [file, height] of Object.entries(heights)) {
    const name = file.replace("_v001.png", ".png");
    const buffer = await normalizeTransparent(path.join(dir, file), 256, 384, 224, height, 320);
    await writeAll(buffer, path.join("city", "default", name));
  }
  const lot = await normalizeTransparent(path.join(dir, "lot_empty_default_tile_v001.png"), 256, 128, 240, 112, 120);
  await writeAll(lot, path.join("city", "default", "lot_empty_default_tile.png"));
}

async function exportCrane() {
  const dir = path.join(source, "city", "default");
  const rigTransparent = await removeWhite(path.join(dir, "crane_rig_default_sprite_v001.png"));
  const { data: rigTrimmedData, info: rigTrimmedInfo } = await rigTransparent
    .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer({ resolveWithObject: true });
  const upperAssemblyHeight = Math.round(rigTrimmedInfo.height * 0.66);
  const rigTrimmed = await sharp(rigTrimmedData)
    .extract({ left: 0, top: 0, width: rigTrimmedInfo.width, height: upperAssemblyHeight })
    .resize(1000, 220, { fit: "inside" })
    .png()
    .toBuffer();
  const rig = await sharp({ create: { width: 1024, height: 512, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: rigTrimmed, left: 12, top: 8 }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  await writeAll(rig, path.join("stack", "default", "crane_rig_default_sprite.png"));

  const hookTransparent = await removeWhite(path.join(dir, "crane_hook_default_sprite_v001.png"));
  const hookInput = await hookTransparent.png().toBuffer();
  const hook = await normalizeTransparent(hookInput, 128, 128, 104, 116, 122);
  await writeAll(hook, path.join("stack", "default", "crane_hook_default_sprite.png"));
}

async function exportBackgrounds() {
  const dir = path.join(source, "bg", "default");
  const sky = await resizeSource(path.join(dir, "bg_stack_default_sky_v001.png"), 1024, 1536, "cover");
  await writeAll(sky, path.join("bg", "default", "bg_stack_default_sky.png"));
  const downtown = await resizeSource(path.join(dir, "bg_downtown_default_map_v001.png"), 1536, 1024, "cover");
  await writeAll(downtown, path.join("bg", "default", "bg_downtown_default_map.png"));
}

async function main() {
  await exportStack();
  await exportCity();
  await exportCrane();
  await exportBackgrounds();
  console.log("Exported approved assets to Web and YouTube runtime folders.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
