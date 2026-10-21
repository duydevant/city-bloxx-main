// C8.1 Deterministic Crane Rig Asset Fixer (v2 - Bold 45-degree Tapered Jib Tip + Bottom Pulley)
// Ensures for all 4 crane rig sprites (default, brick, winter, season):
// 1. Top edge (top chord) of the jib boom is unmistakably longer (~75px) than the bottom edge (bottom chord),
//    forming a clean 45-degree '\' slanted crane jib tip.
// 2. The pulley wheel housing is mounted underneath the bottom edge (bottom chord), so the cable hangs from the bottom edge.
// 3. Updates approved, web, playable, source, QA manifests, and assets.manifest.json SHA-256 hashes.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("node:module").createRequire(path.resolve(__dirname, "../base-game-nextjs/package.json"))("sharp");

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "packages/city-bloxx-content/assets.manifest.json");

function clampByte(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function getPixel(buf, width, height, x, y) {
  if (x < 0 || x >= width || y < 0 || y >= height) return [0, 0, 0, 0];
  const idx = (y * width + x) * 4;
  return [buf[idx], buf[idx + 1], buf[idx + 2], buf[idx + 3]];
}

function setPixel(buf, width, height, x, y, rgba) {
  if (x < 0 || x >= width || y < 0 || y >= height) return;
  const idx = (y * width + x) * 4;
  buf[idx] = rgba[0];
  buf[idx + 1] = rgba[1];
  buf[idx + 2] = rgba[2];
  buf[idx + 3] = rgba[3];
}

async function fixDefaultCrane(inputFile) {
  const { data, info } = await sharp(inputFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const src = Buffer.from(data);
  const out = Buffer.from(data);
  const { width, height } = info;

  // Clear the right tip region (x = 895..1023, y = 45..185) while keeping existing truss diagonal for y = 85..138, x <= 924
  for (let y = 45; y <= 185; y++) {
    for (let x = 895; x < width; x++) {
      if (y >= 85 && y <= 138 && x <= 924) continue;
      setPixel(out, width, height, x, y, [0, 0, 0, 0]);
    }
  }

  // 1. Top horizontal steel chord (y = 74..85) extends all the way out to x = 1006!
  for (let y = 74; y <= 85; y++) {
    for (let x = 895; x <= 1006; x++) {
      const sampleX = 840 + ((x - 895) % 28);
      const rgba = [...getPixel(src, width, height, sampleX, y)];
      if (x >= 1003 && rgba[3] > 0) {
        rgba[0] = 28;
        rgba[1] = 36;
        rgba[2] = 43;
        rgba[3] = 255;
      }
      setPixel(out, width, height, x, y, rgba);
    }
  }

  // 2. Bottom horizontal steel chord (y = 138..149) stops at x = 934 (72px shorter than top chord!)
  for (let y = 138; y <= 149; y++) {
    for (let x = 895; x <= 934; x++) {
      const sampleX = 840 + ((x - 895) % 28);
      const rgba = [...getPixel(src, width, height, sampleX, y)];
      if (x >= 931 && rgba[3] > 0) {
        rgba[0] = 28;
        rgba[1] = 36;
        rgba[2] = 43;
        rgba[3] = 255;
      }
      setPixel(out, width, height, x, y, rgba);
    }
  }

  // 3. Draw truss diagonals in x = 915..1006, y = 85..138:
  //    a) Inner '/' diagonal from bottom V-joint (x = 918 at y = 138) up-right to top (x = 954 at y = 85)
  //    b) Bold outer 45-degree '\' slanted jib tip strut from top tip (x = 1000 at y = 85) down-left to bottom tip (x = 928 at y = 138)!
  for (let y = 85; y <= 138; y++) {
    const t = (y - 85) / (138 - 85); // 0 at top chord, 1 at bottom chord
    const slashX = Math.round(954 - t * 36);
    for (let dx = -6; dx <= 6; dx++) {
      const isBorder = Math.abs(dx) >= 5;
      const rgba = isBorder ? [26, 34, 40, 255] : dx < 0 ? [75, 90, 102, 255] : [58, 72, 82, 255];
      setPixel(out, width, height, slashX + dx, y, rgba);
    }
    const tipX = Math.round(1000 - t * 72);
    for (let dx = -7; dx <= 7; dx++) {
      const isBorder = Math.abs(dx) >= 5;
      const rgba = isBorder ? [26, 34, 40, 255] : dx < 0 ? [78, 94, 106, 255] : [58, 72, 82, 255];
      setPixel(out, width, height, tipX + dx, y, rgba);
    }
  }

  // 4. Mount the yellow pulley housing UNDERNEATH the bottom chord (y = 148..173, centered at x = 924, y = 159)
  // In original src, the yellow pulley housing sits at x = 955..988, y = 50..74 (with hole center at x = 974, y = 64).
  // Reflect it vertically (srcY = 223 - y) and shift 50px left (srcX = x + 50) so the pulley hole lands at (924, 159) right below the bottom tip!
  for (let y = 148; y <= 174; y++) {
    const srcY = 223 - y;
    for (let x = 905; x <= 939; x++) {
      const srcX = x + 50;
      const rgba = getPixel(src, width, height, srcX, srcY);
      if (rgba[3] > 32) {
        setPixel(out, width, height, x, y, rgba);
      }
    }
  }

  return sharp(out, { raw: info }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

async function fixBrickCrane(inputFile) {
  const { data, info } = await sharp(inputFile).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const src = Buffer.from(data);
  const out = Buffer.from(data);
  const { width, height } = info;

  // Clear the right bay region (x = 815..959, y = 232..345) while preserving stay cable above y = 244 for x < 890
  for (let y = 232; y <= 345; y++) {
    for (let x = 815; x < 960; x++) {
      if (y < 244 && x < 890) continue;
      setPixel(out, width, height, x, y, [0, 0, 0, 0]);
    }
  }

  // Smoothly land the diagonal top stay cable from y = 231 down into the top chord at y = 244
  for (let y = 231; y <= 244; y++) {
    const shiftX = Math.round((y - 228) * 5.15);
    for (let srcX = 834; srcX <= 882; srcX++) {
      const rgba = getPixel(src, width, height, srcX, 228);
      if (rgba[3] > 0) {
        setPixel(out, width, height, Math.min(953, srcX + shiftX), y, rgba);
      }
    }
  }

  // 1. Extend the top horizontal steel chord (y = 244..256) all the way out to x = 954!
  for (let y = 244; y <= 256; y++) {
    for (let x = 815; x <= 954; x++) {
      const sampleX = 760 + ((x - 815) % 28);
      const rgba = [...getPixel(src, width, height, sampleX, y)];
      if (x >= 951 && rgba[3] > 0) {
        rgba[0] = 34;
        rgba[1] = 43;
        rgba[2] = 54;
        rgba[3] = 255;
      }
      setPixel(out, width, height, x, y, rgba);
    }
  }

  // 2. Bottom horizontal steel chord (y = 298..310) stops at x = 886 (68px shorter than top chord!)
  for (let y = 298; y <= 310; y++) {
    for (let x = 815; x <= 886; x++) {
      const sampleX = 760 + ((x - 815) % 28);
      const rgba = [...getPixel(src, width, height, sampleX, y)];
      if (x >= 883 && rgba[3] > 0) {
        rgba[0] = 34;
        rgba[1] = 43;
        rgba[2] = 54;
        rgba[3] = 255;
      }
      setPixel(out, width, height, x, y, rgba);
    }
  }

  // 3. Restore X-brace in bay x = 815..880 and draw bold 45-degree '\' slanted outer jib tip strut from (948, 256) down-left to (880, 298)!
  for (let y = 256; y <= 298; y++) {
    // Copy existing truss bay from x = 815..886
    for (let x = 815; x <= 886; x++) {
      const rgba = getPixel(src, width, height, x, y);
      if (rgba[3] > 0) setPixel(out, width, height, x, y, rgba);
    }
    const t = (y - 256) / (298 - 256);
    // Inner '/' support brace from bottom (880, 298) up-right to top (914, 256)
    const innerCenter = Math.round(914 - t * 34);
    for (let dx = -5; dx <= 5; dx++) {
      const isBorder = Math.abs(dx) >= 4;
      const rgba = isBorder ? [34, 43, 54, 255] : dx < 0 ? [84, 98, 114, 255] : [64, 77, 92, 255];
      setPixel(out, width, height, innerCenter + dx, y, rgba);
    }
    // Bold outer 45-degree '\' slanted tip strut from top tip (948, 256) down-left to bottom chord end (880, 298)
    const outerCenter = Math.round(948 - t * 68);
    for (let dx = -7; dx <= 7; dx++) {
      const isBorder = Math.abs(dx) >= 5;
      const rgba = isBorder ? [34, 43, 54, 255] : dx < 0 ? [88, 104, 120, 255] : [64, 77, 92, 255];
      setPixel(out, width, height, outerCenter + dx, y, rgba);
    }
  }

  // 4. Mount the circular yellow pulley wheel housing UNDERNEATH the bottom chord end (centered at x = 876, y = 316)
  for (let y = 302; y <= 334; y++) {
    const srcY = 570 - y;
    for (let x = 857; x <= 895; x++) {
      const distFromCenter = Math.abs(x - 876);
      const srcX = 931 + distFromCenter;
      const rgba = getPixel(src, width, height, srcX, srcY);
      if (rgba[3] > 0) {
        setPixel(out, width, height, x, y, rgba);
      }
    }
  }

  return sharp(out, { raw: info }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
}

async function materialEditWinter(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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
      let nr = luma * 0.72 + 48;
      let ng = luma * 0.86 + 68;
      let nb = luma * 0.98 + 88;
      if (y > 0) {
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

async function materialEditSeason(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
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

function writeEverywhere(relativePath, buffer, sourceRelative = null) {
  for (const dir of ["art/approved", "base-game-nextjs/public/game", "base-playable-main/public/game"]) {
    const file = path.join(root, dir, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, buffer);
  }
  if (sourceRelative) {
    const srcFile = path.join(root, "art/source", sourceRelative);
    fs.mkdirSync(path.dirname(srcFile), { recursive: true });
    fs.writeFileSync(srcFile, buffer);
  }
}

async function main() {
  const { execFileSync } = require("node:child_process");
  const defaultOrig = execFileSync("git", ["show", "HEAD:art/approved/stack/default/crane_rig_default_sprite.png"], { cwd: root, maxBuffer: 10 * 1024 * 1024 });
  const brickOrig = execFileSync("git", ["show", "HEAD:art/approved/rig/brick/crane_rig_brick_sprite.png"], { cwd: root, maxBuffer: 10 * 1024 * 1024 });

  const fixedDefault = await fixDefaultCrane(defaultOrig);
  const fixedBrick = await fixBrickCrane(brickOrig);
  const fixedWinter = await materialEditWinter(fixedBrick);
  const fixedSeason = await materialEditSeason(fixedBrick);

  writeEverywhere("stack/default/crane_rig_default_sprite.png", fixedDefault);
  writeEverywhere("rig/brick/crane_rig_brick_sprite.png", fixedBrick);
  writeEverywhere("rig/winter/crane_rig_winter_sprite.png", fixedWinter, "rig/winter/crane_rig_winter_sprite_v001.png");
  writeEverywhere("rig/season/crane_rig_season_sprite.png", fixedSeason, "rig/season/crane_rig_season_sprite_v001.png");

  const updates = new Map([
    ["stack/default/crane_rig_default_sprite.png", fixedDefault],
    ["rig/brick/crane_rig_brick_sprite.png", fixedBrick],
    ["rig/winter/crane_rig_winter_sprite.png", fixedWinter],
    ["rig/season/crane_rig_season_sprite.png", fixedSeason],
  ]);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const asset of manifest.assets) {
    const buf = updates.get(asset.path);
    if (buf) {
      asset.bytes = buf.length;
      asset.sha256 = crypto.createHash("sha256").update(buf).digest("hex");
    }
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  const brickQaPath = path.join(root, "art/qa/brick-import.json");
  if (fs.existsSync(brickQaPath)) {
    const brickQa = JSON.parse(fs.readFileSync(brickQaPath, "utf8"));
    for (const item of brickQa.assets) {
      if (item.path === "rig/brick/crane_rig_brick_sprite.png") {
        item.bytes = fixedBrick.length;
      }
    }
    brickQa.packBytes = brickQa.assets.reduce((sum, a) => sum + a.bytes, 0);
    fs.writeFileSync(brickQaPath, JSON.stringify(brickQa, null, 2) + "\n");
  }

  const c7QaPath = path.join(root, "art/qa/c7-import.json");
  if (fs.existsSync(c7QaPath)) {
    const c7Qa = JSON.parse(fs.readFileSync(c7QaPath, "utf8"));
    for (const item of c7Qa.assets) {
      if (item.path === "rig/winter/crane_rig_winter_sprite.png") item.bytes = fixedWinter.length;
      if (item.path === "rig/season/crane_rig_season_sprite.png") item.bytes = fixedSeason.length;
    }
    c7Qa.packBytes = c7Qa.assets.reduce((sum, a) => sum + a.bytes, 0);
    fs.writeFileSync(c7QaPath, JSON.stringify(c7Qa, null, 2) + "\n");
  }

  console.log("Updated all 4 crane rig assets (v2 bold 45-deg tip + bottom pulley):");
  for (const [rel, buf] of updates.entries()) {
    console.log(`  ${rel}: ${buf.length} bytes, sha256=${crypto.createHash("sha256").update(buf).digest("hex")}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
