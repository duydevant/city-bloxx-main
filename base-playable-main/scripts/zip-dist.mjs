#!/usr/bin/env node
/**
 * Zip toan bo dist/ thanh dist.zip, voi index.html nam o GOC archive,
 * dong thoi xuat manifest + checksum cho Y2 Certification & Release.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKSPACE_ROOT = path.resolve(ROOT, "..");
const DIST = path.join(ROOT, "dist");
const OUT = path.join(ROOT, "dist.zip");
const MANIFEST_OUT = path.join(WORKSPACE_ROOT, "tmp", "playable-qa", "release-manifest.json");

// ---------- CRC32 ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// ---------- thu muc ----------
function collect(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p, out);
    else out.push(p);
  }
  return out;
}

function dosDateTime(date) {
  const y = Math.max(1980, date.getFullYear());
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const day = (((y - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f);
  return { time, day };
}

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("dist/index.html khong ton tai — chay `npm run build` truoc.");
  process.exit(1);
}

const startupImages = new Set([
  "game/bg/default/bg_stack_default_sky.png",
  "game/stack/default/bldg_residential_default_mid.png",
  "game/stack/default/crane_rig_default_sprite.png",
  "game/stack/default/crane_hook_default_sprite.png",
]);

const files = collect(DIST)
  .map((p) => ({ abs: p, name: path.relative(DIST, p).split(path.sep).join("/") }))
  .filter((f) => !/(^|\/)\.gitkeep$/.test(f.name))
  .sort((a, b) => (a.name === "index.html" ? -1 : b.name === "index.html" ? 1 : a.name.localeCompare(b.name)));

// Fixed DOS timestamp for deterministic archive bytes across identical builds
const fixedDate = new Date("2026-01-01T00:00:00Z");
const { time, day } = dosDateTime(fixedDate);

const localParts = [];
const central = [];
const manifestFiles = [];
let offset = 0;
let totalUncompressedBytes = 0;
let initialPayloadBytes = 0;
let maxSingleFileBytes = 0;

for (const f of files) {
  const raw = fs.readFileSync(f.abs);
  const fileHash = sha256(raw);
  const isInitial = (/\.(?:html|css|js)$/i.test(f.name) && !f.name.endsWith(".map")) || startupImages.has(f.name);
  totalUncompressedBytes += raw.length;
  if (isInitial) initialPayloadBytes += raw.length;
  if (raw.length > maxSingleFileBytes) maxSingleFileBytes = raw.length;
  manifestFiles.push({
    path: f.name,
    sizeBytes: raw.length,
    sha256: fileHash,
    initialStartup: isInitial,
  });

  const crc = crc32(raw);
  const deflated = zlib.deflateRawSync(raw, { level: 9 });
  const useDeflate = deflated.length < raw.length;
  const data = useDeflate ? deflated : raw;
  const method = useDeflate ? 8 : 0;
  const nameBuf = Buffer.from(f.name, "utf8");

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0x0800, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(day, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);

  localParts.push(local, nameBuf, data);

  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0);
  cen.writeUInt16LE(20, 4);
  cen.writeUInt16LE(20, 6);
  cen.writeUInt16LE(0x0800, 8);
  cen.writeUInt16LE(method, 10);
  cen.writeUInt16LE(time, 12);
  cen.writeUInt16LE(day, 14);
  cen.writeUInt32LE(crc, 16);
  cen.writeUInt32LE(data.length, 20);
  cen.writeUInt32LE(raw.length, 24);
  cen.writeUInt16LE(nameBuf.length, 28);
  cen.writeUInt16LE(0, 30);
  cen.writeUInt16LE(0, 32);
  cen.writeUInt16LE(0, 34);
  cen.writeUInt16LE(0, 36);
  cen.writeUInt32LE(0, 38);
  cen.writeUInt32LE(offset, 42);
  central.push(Buffer.concat([cen, nameBuf]));

  offset += local.length + nameBuf.length + data.length;
}

const centralBuf = Buffer.concat(central);
const eocd = Buffer.alloc(22);
eocd.writeUInt32LE(0x06054b50, 0);
eocd.writeUInt16LE(0, 4);
eocd.writeUInt16LE(0, 6);
eocd.writeUInt16LE(files.length, 8);
eocd.writeUInt16LE(files.length, 10);
eocd.writeUInt32LE(centralBuf.length, 12);
eocd.writeUInt32LE(offset, 16);
eocd.writeUInt16LE(0, 20);

const zipBuffer = Buffer.concat([...localParts, centralBuf, eocd]);
fs.rmSync(OUT, { force: true });
fs.writeFileSync(OUT, zipBuffer);

const zipHash = sha256(zipBuffer);
let gitCommit = "unknown";
try {
  gitCommit = execSync("git rev-parse --short HEAD", { cwd: WORKSPACE_ROOT, stdio: ["ignore", "pipe", "ignore"] })
    .toString("utf8")
    .trim();
} catch {
  /* fallback */
}

const releaseManifest = {
  buildId: `city-bloxx-playable-${gitCommit}-${zipHash.slice(0, 12)}`,
  gitCommit,
  generatedAt: new Date().toISOString(),
  versions: {
    physicsVersion: "quick-tower-physics-v13",
    rulesetVersion: "quick-tower-v2",
    assistRulesetVersion: "quick-tower-assist-v2",
    cityRulesetVersion: "build-city-v7",
    dailyRulesetVersion: "daily-tower-v1",
    ratingVersion: "quick-rating-v2",
    cityRatingVersion: "city-rating-v1",
    saveSchema: 4,
    saveEnvelopeVersion: 1,
    cosmeticCatalogVersion: 1,
  },
  budgets: {
    initialPayloadBytes,
    initialPayloadLimitBytes: 8 * 1024 * 1024,
    totalUncompressedBytes,
    totalUncompressedLimitBytes: 20 * 1024 * 1024,
    zipArchiveBytes: zipBuffer.length,
    zipArchiveLimitBytes: 20 * 1024 * 1024,
    maxSingleFileBytes,
    maxSingleFileLimitBytes: 2 * 1024 * 1024,
    saveBudgetBytes: 256 * 1024,
    hostMaxBytes: 30 * 1024 * 1024,
  },
  archive: {
    path: "base-playable-main/dist.zip",
    sizeBytes: zipBuffer.length,
    sha256: zipHash,
    fileCount: files.length,
  },
  files: manifestFiles,
};

fs.mkdirSync(path.dirname(MANIFEST_OUT), { recursive: true });
fs.writeFileSync(MANIFEST_OUT, JSON.stringify(releaseManifest, null, 2));

const size = zipBuffer.length;
console.log(`Da tao ${path.relative(ROOT, OUT)} (${(size / 1024).toFixed(1)} KiB, ${files.length} file, sha256=${zipHash.slice(0, 16)}...).`);
console.log(`Build ID: ${releaseManifest.buildId}`);
console.log("  " + files.map((f) => f.name).join("\n  "));
