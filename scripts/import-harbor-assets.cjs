// Explicit opt-in Harbor C5 asset importer. Preserves Default and Brick assets.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require("node:module").createRequire(path.resolve(__dirname, "../base-game-nextjs/package.json"))("sharp");

const root = path.resolve(__dirname, "..");
const manifestPath = path.join(root, "packages/city-bloxx-content/assets.manifest.json");

function newest(branch, subdir, id) {
  const dir = path.join(root, "art/source", branch, subdir);
  if (!fs.existsSync(dir)) throw new Error(`Missing source directory: ${dir}`);
  const files = fs
    .readdirSync(dir)
    .filter((f) => new RegExp(`^${id}_v[0-9]{3}\\.png$`).test(f))
    .sort();
  if (!files.length) throw new Error(`Missing source: ${id}`);
  return path.join(dir, files[files.length - 1]);
}

async function ensureSourcesFromArtifactIfPresent() {
  const bgSourceDir = path.join(root, "art/source/bg/harbor");
  const citySourceDir = path.join(root, "art/source/city/harbor");
  fs.mkdirSync(bgSourceDir, { recursive: true });
  fs.mkdirSync(citySourceDir, { recursive: true });

  const bgSourceTarget = path.join(bgSourceDir, "bg_harbor_default_map_v001.png");
  const landmarkSourceTarget = path.join(citySourceDir, "landmark_dock_clock_tower_mini_v001.png");

  const artifactDir = "C:\\Users\\AG26\\.gemini\\antigravity\\brain\\ef3d55b4-71be-40a7-aa2d-e4441829455e";
  if (!fs.existsSync(bgSourceTarget) && fs.existsSync(artifactDir)) {
    const bgCandidates = fs
      .readdirSync(artifactDir)
      .filter((f) => f.startsWith("bg_harbor_default_map_v001") && /\.(png|jpg|jpeg)$/i.test(f))
      .sort();
    if (bgCandidates.length > 0) {
      const src = path.join(artifactDir, bgCandidates[bgCandidates.length - 1]);
      const buf = await sharp(src).resize(1536, 1024, { fit: "cover" }).removeAlpha().png({ compressionLevel: 9 }).toBuffer();
      fs.writeFileSync(bgSourceTarget, buf);
    }
  }

  if (!fs.existsSync(landmarkSourceTarget) && fs.existsSync(artifactDir)) {
    const lmCandidates = fs
      .readdirSync(artifactDir)
      .filter((f) => f.startsWith("landmark_dock_clock_tower_mini_v001") && /\.(png|jpg|jpeg)$/i.test(f))
      .sort();
    if (lmCandidates.length > 0) {
      const src = path.join(artifactDir, lmCandidates[lmCandidates.length - 1]);
      const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const w = info.width;
      const h = info.height;
      const visited = new Uint8Array(w * h);
      const queue = new Int32Array(w * h);
      let head = 0;
      let tail = 0;
      const isBg = (idx) => {
        const o = idx * 4;
        return data[o + 3] < 245 || (data[o] >= 240 && data[o + 1] >= 240 && data[o + 2] >= 240);
      };
      const push = (x, y) => {
        if (x < 0 || x >= w || y < 0 || y >= h) return;
        const idx = y * w + x;
        if (visited[idx] || !isBg(idx)) return;
        visited[idx] = 1;
        queue[tail++] = idx;
      };
      for (let x = 0; x < w; x++) {
        push(x, 0);
        push(x, h - 1);
      }
      for (let y = 0; y < h; y++) {
        push(0, y);
        push(w - 1, y);
      }
      while (head < tail) {
        const idx = queue[head++];
        data[idx * 4 + 3] = 0;
        const x = idx % w;
        const y = Math.floor(idx / w);
        push(x - 1, y);
        push(x + 1, y);
        push(x, y - 1);
        push(x, y + 1);
      }
      const rgbaSource = await sharp(data, { raw: info }).png({ compressionLevel: 9 }).toBuffer();
      fs.writeFileSync(landmarkSourceTarget, rgbaSource);
    }
  }
}

async function cutout(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width;
  let y0 = info.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const offset = (y * info.width + x) * 4;
      if (data[offset + 3] < 241) {
        data[offset + 3] = 0;
      } else {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  if (x1 < x0) throw new Error(`Empty source: ${file}`);
  const crop = { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
  return {
    buffer: await sharp(data, { raw: info }).extract(crop).png().toBuffer(),
    crop,
    source: path.relative(root, file).replace(/\\/g, "/"),
  };
}

async function main() {
  await ensureSourcesFromArtifactIfPresent();

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const before = manifest.assets.filter((a) => !a.path.includes("/harbor/"));
  const imported = [];
  const qa = [];

  async function write(relative, buffer, width, height, source) {
    if (!relative.includes("/harbor/")) throw new Error("Only Harbor imports are allowed");
    const limit = relative.startsWith("bg/harbor/bg_harbor_default_map")
      ? 1048576
      : relative.startsWith("bg/harbor/bg_harbor_default_thumb")
        ? 262144
        : 131072;
    if (buffer.length > limit) throw new Error(`Harbor asset exceeds budget (${buffer.length} > ${limit}): ${relative}`);
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
      source: source?.source ?? "derived from approved harbor map",
      sourceCrop: source?.crop ?? null,
      width,
      height,
      bytes: buffer.length,
    });
  }

  // 1. Harbor background (1536x1024 opaque, <= 1 MiB)
  const bgSourceFile = newest("bg", "harbor", "bg_harbor_default_map");
  let bgBuffer = await sharp(bgSourceFile)
    .resize(1536, 1024, { fit: "cover" })
    .removeAlpha()
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
    .toBuffer();
  await write("bg/harbor/bg_harbor_default_map.png", bgBuffer, 1536, 1024, {
    source: path.relative(root, bgSourceFile).replace(/\\/g, "/"),
    crop: { left: 0, top: 0, width: 1536, height: 1024 },
  });

  // 2. Harbor thumbnail (512x512 opaque, cropped/exported from background)
  const thumbCrop = { left: 256, top: 0, width: 1024, height: 1024 };
  const thumbBuffer = await sharp(bgBuffer)
    .extract(thumbCrop)
    .resize(512, 512)
    .removeAlpha()
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
    .toBuffer();
  await write("bg/harbor/bg_harbor_default_thumb.png", thumbBuffer, 512, 512, {
    source: "art/approved/bg/harbor/bg_harbor_default_map.png",
    crop: thumbCrop,
  });

  // 3. Dock Clock Tower landmark mini (256x384 RGBA, ground anchor at (128, 320))
  const lmSourceFile = newest("city", "harbor", "landmark_dock_clock_tower_mini");
  const lmCutout = await cutout(lmSourceFile);
  const { data: lmData, info: lmInfo } = await sharp(lmCutout.buffer)
    .resize(192, 256, { fit: "inside" })
    .png()
    .toBuffer({ resolveWithObject: true });
  const lmBuffer = await sharp({
    create: { width: 256, height: 384, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: lmData, left: Math.floor((256 - lmInfo.width) / 2), top: 320 - lmInfo.height }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
  await write("city/harbor/landmark_dock_clock_tower_mini.png", lmBuffer, 256, 384, lmCutout);

  const packBytes = imported.reduce((n, a) => n + a.bytes, 0);
  if (packBytes > 1536 * 1024) throw new Error(`Harbor pack exceeds budget: ${packBytes}`);

  manifest.assets = [...before, ...imported];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  fs.mkdirSync(path.join(root, "art/qa"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "art/qa/harbor-import.json"),
    JSON.stringify(
      {
        version: "harbor-art-1",
        generator: "built-in image_gen",
        promptSpec: "plan/12-art-requirements.md#9-harbor-prompts",
        normalization:
          "1536x1024 opaque map <=1MiB; 512x512 thumbnail cropped from map; 256x384 RGBA landmark cutout anchored at (128,320); Default and Brick untouched",
        packBytes,
        assets: qa,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ files: imported.length, packBytes, preservedAssets: before.length }));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
