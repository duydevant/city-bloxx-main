#!/usr/bin/env node
/**
 * Zip toan bo dist/ thanh dist.zip, voi index.html nam o GOC archive.
 * (Neu de index.html trong mot thu muc con, Test Suite se khong nhan ra game.)
 *
 * Viet thuan bang Node, khong can `zip` / `Compress-Archive` cua he dieu hanh:
 *  - duong dan trong archive LUON dung "/" (Compress-Archive cua Windows
 *    PowerShell 5.1 viet "\" -> co tool doc khong duoc, va Test Suite kiem tra
 *    ten file chi cho phep [A-Za-z0-9._-/]).
 *  - ket qua giong het nhau tren Windows / Linux / macOS.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const OUT = path.join(ROOT, "dist.zip");

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

const files = collect(DIST)
  .map((p) => ({ abs: p, name: path.relative(DIST, p).split(path.sep).join("/") }))
  // khong dong goi file rac cua VCS
  .filter((f) => !/(^|\/)\.gitkeep$/.test(f.name))
  .sort((a, b) => (a.name === "index.html" ? -1 : b.name === "index.html" ? 1 : a.name.localeCompare(b.name)));

const now = new Date();
const { time, day } = dosDateTime(now);

const localParts = [];
const central = [];
let offset = 0;

for (const f of files) {
  const raw = fs.readFileSync(f.abs);
  const crc = crc32(raw);
  const deflated = zlib.deflateRawSync(raw, { level: 9 });
  const useDeflate = deflated.length < raw.length;
  const data = useDeflate ? deflated : raw;
  const method = useDeflate ? 8 : 0;
  const nameBuf = Buffer.from(f.name, "utf8");

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // flag: UTF-8 filename
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(day, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28); // extra len

  localParts.push(local, nameBuf, data);

  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0);
  cen.writeUInt16LE(20, 4); // version made by
  cen.writeUInt16LE(20, 6); // version needed
  cen.writeUInt16LE(0x0800, 8);
  cen.writeUInt16LE(method, 10);
  cen.writeUInt16LE(time, 12);
  cen.writeUInt16LE(day, 14);
  cen.writeUInt32LE(crc, 16);
  cen.writeUInt32LE(data.length, 20);
  cen.writeUInt32LE(raw.length, 24);
  cen.writeUInt16LE(nameBuf.length, 28);
  cen.writeUInt16LE(0, 30); // extra
  cen.writeUInt16LE(0, 32); // comment
  cen.writeUInt16LE(0, 34); // disk number
  cen.writeUInt16LE(0, 36); // internal attrs
  cen.writeUInt32LE(0, 38); // external attrs
  cen.writeUInt32LE(offset, 42); // local header offset
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

fs.rmSync(OUT, { force: true });
fs.writeFileSync(OUT, Buffer.concat([...localParts, centralBuf, eocd]));

const size = fs.statSync(OUT).size;
console.log(`Da tao ${path.relative(ROOT, OUT)} (${(size / 1024).toFixed(1)} KiB, ${files.length} file).`);
console.log("  " + files.map((f) => f.name).join("\n  "));
