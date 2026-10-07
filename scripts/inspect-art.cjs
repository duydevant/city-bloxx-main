const fs = require("node:fs");
const path = require("node:path");
const sharp = require("node:module").createRequire(path.resolve(__dirname,"../base-game-nextjs/package.json"))("sharp");

const root = path.resolve(__dirname, "..");
const artRoot = path.join(root, "art", "source");
const reviewRoot = path.join(root, "tmp", "art-review");

function listPngs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listPngs(full);
    return entry.isFile() && entry.name.toLowerCase().endsWith(".png") ? [full] : [];
  });
}

function esc(value) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[char]);
}

function checkerSvg(width, height) {
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs><pattern id="c" width="24" height="24" patternUnits="userSpaceOnUse">
        <rect width="24" height="24" fill="#e5e7eb"/>
        <rect width="12" height="12" fill="#ffffff"/>
        <rect x="12" y="12" width="12" height="12" fill="#ffffff"/>
      </pattern></defs>
      <rect width="100%" height="100%" fill="url(#c)"/>
    </svg>`);
}

async function buildSheet(name, files, columns, cellWidth, cellHeight) {
  const labelHeight = 48;
  const rows = Math.ceil(files.length / columns);
  const width = columns * cellWidth;
  const height = rows * (cellHeight + labelHeight);
  const composites = [];

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const left = (index % columns) * cellWidth;
    const top = Math.floor(index / columns) * (cellHeight + labelHeight);
    const rendered = await sharp(file)
      .resize(cellWidth - 24, cellHeight - 24, { fit: "contain", withoutEnlargement: true })
      .png()
      .toBuffer();
    const meta = await sharp(rendered).metadata();
    composites.push({
      input: rendered,
      left: left + Math.floor((cellWidth - meta.width) / 2),
      top: top + Math.floor((cellHeight - meta.height) / 2),
    });
    const label = esc(path.basename(file).replace("_v001.png", ""));
    composites.push({
      input: Buffer.from(`<svg width="${cellWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#111827"/><text x="${cellWidth / 2}" y="29" text-anchor="middle" font-family="Arial" font-size="15" fill="white">${label}</text></svg>`),
      left,
      top: top + cellHeight,
    });
  }

  const output = path.join(reviewRoot, `${name}.png`);
  await sharp(checkerSvg(width, height)).composite(composites).png().toFile(output);
  return output;
}

async function main() {
  fs.mkdirSync(reviewRoot, { recursive: true });
  const files = listPngs(artRoot).sort();
  const report = [];

  for (const file of files) {
    const image = sharp(file);
    const meta = await image.metadata();
    const stats = await image.stats();
    const alpha = stats.channels[3];
    let alphaBounds = null;
    if (meta.hasAlpha) {
      const { info } = await sharp(file).trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer({ resolveWithObject: true });
      alphaBounds = {
        left: -(info.trimOffsetLeft ?? 0),
        top: -(info.trimOffsetTop ?? 0),
        width: info.width,
        height: info.height,
      };
    }
    report.push({
      file: path.relative(root, file).replaceAll("\\", "/"),
      width: meta.width,
      height: meta.height,
      format: meta.format,
      channels: meta.channels,
      hasAlpha: meta.hasAlpha,
      alphaMin: alpha?.min ?? null,
      alphaMax: alpha?.max ?? null,
      alphaBounds,
      bytes: fs.statSync(file).size,
    });
  }

  fs.writeFileSync(path.join(reviewRoot, "metadata.json"), JSON.stringify(report, null, 2));

  const stack = files.filter((file) => file.includes(`${path.sep}stack${path.sep}`));
  const city = files.filter((file) => file.includes(`${path.sep}city${path.sep}`));
  const bg = files.filter((file) => file.includes(`${path.sep}bg${path.sep}`));
  const style = files.filter((file) => file.includes(`${path.sep}style${path.sep}`));

  const outputs = [];
  if (stack.length) outputs.push(await buildSheet("stack", stack, 3, 420, 250));
  if (city.length) outputs.push(await buildSheet("city", city, 3, 380, 300));
  if (bg.length) outputs.push(await buildSheet("backgrounds", bg, 2, 520, 360));
  if (style.length) outputs.push(await buildSheet("style", style, 1, 900, 650));

  console.log(JSON.stringify({ report, sheets: outputs }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
