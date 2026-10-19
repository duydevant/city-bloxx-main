// Explicit opt-in C7 Winter & Season asset importer.
// Performs deterministic material edits on the approved Brick rig, hook, and residential roof
// so silhouette, alpha cutout, bounding boxes, and anchors are 100% preserved per plan/12-art-requirements.md.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("node:module").createRequire(path.resolve(__dirname, "../base-game-nextjs/package.json"))("sharp");

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "packages/city-bloxx-content/assets.manifest.json");

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

async function materialEditWinter(file, snowCap = false) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * 4;
      const a = out[idx + 3];
      if (a === 0) continue;
      const r = out[idx];
      const g = out[idx + 1];
      const b = out[idx + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      // Pale painted steel / cool ice-blue palette with crisp cel-shaded contrast
      let nr = luma * 0.72 + 48;
      let ng = luma * 0.86 + 68;
      let nb = luma * 0.98 + 88;
      // Subtle snow detail on top-facing bright surfaces
      if (snowCap && y > 0) {
        const aboveAlpha = y > 2 ? out[((y - 2) * info.width + x) * 4 + 3] : 0;
        if (aboveAlpha === 0 && luma > 95) {
          nr = nr * 0.35 + 244 * 0.65;
          ng = ng * 0.35 + 249 * 0.65;
          nb = nb * 0.35 + 255 * 0.65;
        }
      }
      out[idx] = clampByte(nr);
      out[idx + 1] = clampByte(ng);
      out[idx + 2] = clampByte(nb);
      out[idx + 3] = a;
    }
  }
  return sharp(out, { raw: info }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

async function materialEditSeason(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * 4;
      const a = out[idx + 3];
      if (a === 0) continue;
      const r = out[idx];
      const g = out[idx + 1];
      const b = out[idx + 2];
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      // Warm cream / brushed gold material edit without changing silhouette or anchors
      const nr = luma * 0.96 + 64;
      const ng = luma * 0.84 + 46;
      const nb = luma * 0.56 + 18;
      out[idx] = clampByte(nr);
      out[idx + 1] = clampByte(ng);
      out[idx + 2] = clampByte(nb);
      out[idx + 3] = a;
    }
  }
  return sharp(out, { raw: info }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const c7Prefixes = ["rig/winter/", "stack/winter/", "ui/winter/", "rig/season/", "ui/season/"];
  const before = manifest.assets.filter(a => !c7Prefixes.some(p => a.path.startsWith(p)));
  const imported = [];
  const qa = [];

  async function writeAsset(relative, sourceRel, buffer, width, height) {
    if (sourceRel) {
      const srcFile = path.join(root, "art/source", sourceRel);
      fs.mkdirSync(path.dirname(srcFile), { recursive: true });
      fs.writeFileSync(srcFile, buffer);
    }
    for (const base of ["art/approved", "base-game-nextjs/public/game", "base-playable-main/public/game"]) {
      const file = path.join(root, base, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, buffer);
    }
    imported.push({
      path: relative,
      width,
      height,
      bytes: buffer.length,
      sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
      targets: ["web", "playable"],
    });
    qa.push({
      path: relative,
      source: sourceRel ? `art/source/${sourceRel}` : "code-native SVG badge",
      width,
      height,
      bytes: buffer.length,
    });
  }

  const brickRig = path.join(root, "art/approved/rig/brick/crane_rig_brick_sprite.png");
  const brickHook = path.join(root, "art/approved/rig/brick/crane_hook_brick_sprite.png");
  const brickResRoof = path.join(root, "art/approved/stack/brick/bldg_residential_brick_roof.png");

  const winterRig = await materialEditWinter(brickRig, true);
  await writeAsset("rig/winter/crane_rig_winter_sprite.png", "rig/winter/crane_rig_winter_sprite_v001.png", winterRig, 1024, 512);

  const winterHook = await materialEditWinter(brickHook, false);
  await writeAsset("rig/winter/crane_hook_winter_sprite.png", "rig/winter/crane_hook_winter_sprite_v001.png", winterHook, 128, 128);

  const winterRoof = await materialEditWinter(brickResRoof, true);
  await writeAsset("stack/winter/bldg_residential_winter_roof.png", "stack/winter/bldg_residential_winter_roof_v001.png", winterRoof, 512, 256);

  const winterBadge = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><circle cx="128" cy="128" r="94" fill="#d8effc" stroke="#3c6e91" stroke-width="5"/><path d="M84 194V96h88v98Z" fill="#6ca6c9" stroke="#2d526b" stroke-width="4"/><path d="M76 96l52-32 52 32Z" fill="#f3faff" stroke="#3c6e91" stroke-width="4"/><path d="M128 38v28M114 52h28M104 116h18v22h-18ZM134 116h18v22h-18ZM104 150h18v22h-18ZM134 150h18v22h-18Z" fill="#e9f6ff" stroke="#2d526b" stroke-width="3"/></svg>',
  );
  await writeAsset("ui/winter/event-badge.svg", null, winterBadge, 256, 256);

  const seasonRig = await materialEditSeason(brickRig);
  await writeAsset("rig/season/crane_rig_season_sprite.png", "rig/season/crane_rig_season_sprite_v001.png", seasonRig, 1024, 512);

  const seasonHook = await materialEditSeason(brickHook);
  await writeAsset("rig/season/crane_hook_season_sprite.png", "rig/season/crane_hook_season_sprite_v001.png", seasonHook, 128, 128);

  const seasonBadge = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><circle cx="128" cy="128" r="94" fill="#f6e6b4" stroke="#8c6928" stroke-width="5"/><path d="M128 52l20 42 46 6-33 32 8 46-41-22-41 22 8-46-33-32 46-6Z" fill="#e6b84c" stroke="#6b4f1b" stroke-width="4"/><path d="M98 192h60v16H98Z" fill="#8c6928"/></svg>',
  );
  await writeAsset("ui/season/season-badge.svg", null, seasonBadge, 256, 256);

  const packBytes = imported.reduce((n, a) => n + a.bytes, 0);
  manifest.assets = [...before, ...imported];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  fs.mkdirSync(path.join(root, "art/qa"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "art/qa/c7-import.json"),
    JSON.stringify(
      {
        version: "c7-art-1",
        promptSpec: "plan/12-art-requirements.md#9",
        normalization: "Deterministic material edit from approved Brick rig/hook/roof preserving exact alpha cutout, bounding boxes and anchors",
        packBytes,
        assets: qa,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ files: imported.length, packBytes, totalAssets: manifest.assets.length }));
}

main().catch(e => {
  console.error(e);
  process.exitCode = 1;
});
