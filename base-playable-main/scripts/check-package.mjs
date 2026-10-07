#!/usr/bin/env node
/**
 * Kiem tra dist/ co thoa cac MUST cua YouTube Playables Test Suite khong.
 * Chay tu dong trong `npm run package` va trong Docker build.
 *
 * Kiem tra:
 *  1. dist/index.html ton tai, index.html nam o goc archive
 *  2. Ten moi file chi chua [A-Za-z0-9._-/]  (khong co "@", " ", tieng Viet co dau...)
 *  3. Script SDK https://www.youtube.com/game_api/v1 co mat va dung TRUOC moi
 *     script type="module" cua game
 *  4. Khong co <meta http-equiv="Content-Security-Policy"> (chan iframe Test Suite)
 *  5. Khong co request nao ra ben ngoai ngoai SDK
 *  6. Tong bundle < 30 MiB
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const LIMIT_MIB = 30;
const SDK_URL = "https://www.youtube.com/game_api/v1";

/** Cac URL xuat hien trong code nhung KHONG tao request mang. */
const INERT_URLS = [
  /^https?:\/\/www\.w3\.org\//,
  /^https?:\/\/schemas\./,
  /^https?:\/\/purl\.org\//,
  /^https?:\/\/creativecommons\.org\//,
];

let errors = 0;
const fail = (m) => { console.error(`[FAIL] ${m}`); errors += 1; };
const ok = (m) => console.log(`[ OK ] ${m}`);

function collect(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collect(p, out);
    else out.push(p);
  }
  return out;
}

if (!fs.existsSync(DIST) || !fs.existsSync(path.join(DIST, "index.html"))) {
  fail("dist/index.html khong ton tai — chay `npm run build` truoc");
  console.error(`\n${errors} loi.`);
  process.exit(1);
}

const files = collect(DIST);
const rel = (p) => path.relative(DIST, p).split(path.sep).join("/");

// ---- 1. ten file ----
const BAD_NAME = /[^A-Za-z0-9._\-/]/;
let badNames = 0;
for (const f of files) {
  const r = rel(f);
  if (BAD_NAME.test(r)) {
    fail(`ten file khong hop le: "${r}" — chi duoc dung chu cai, so, dau cham, gach duoi, gach ngang`);
    badNames += 1;
  }
}
if (!badNames) ok(`ten file hop le (${files.length} file)`);

// ---- 2. SDK script ----
const html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");
const sdkIdx = html.indexOf(SDK_URL);
if (sdkIdx === -1) fail(`index.html thieu script SDK: ${SDK_URL}`);
else {
  const firstModule = html.search(/<script[^>]+type=["']module["']/i);
  const firstAnyScript = html.search(/<script(?![^>]*game_api)[^>]*src=/i);
  if (firstModule !== -1 && sdkIdx > firstModule) {
    fail('SDK script phai dung TRUOC <script type="module"> dau tien cua game');
  } else if (firstAnyScript !== -1 && sdkIdx > firstAnyScript) {
    fail("SDK script phai la script dau tien duoc load trong <head>");
  } else {
    ok("SDK script co mat va dung truoc moi game code");
  }
}

// ---- 3. CSP meta ----
if (/http-equiv\s*=\s*["']Content-Security-Policy["']/i.test(html)) {
  fail('index.html chua <meta http-equiv="Content-Security-Policy"> — phai xoa, no chan Test Suite nhung game vao iframe');
} else ok("khong co CSP meta (iframe Test Suite se load duoc)");

if (/X-Frame-Options/i.test(html)) {
  fail("index.html chua X-Frame-Options — phai xoa");
}

// ---- 4. URL ra ben ngoai ----
const TEXT_EXT = /\.(?:html|css|js|mjs|json|svg|txt|webmanifest)$/i;
const urlRe = /https?:\/\/[^\s"'`<>()]+/g;
const found = new Map();
for (const f of files) {
  if (!TEXT_EXT.test(f)) continue;
  if (f.endsWith(".map")) continue;
  const text = fs.readFileSync(f, "utf8");
  for (const m of text.matchAll(urlRe)) {
    const u = m[0].replace(/[.,;:]+$/, "");
    if (u === SDK_URL) continue;
    if (u.includes("sourceMappingURL")) continue;
    if (INERT_URLS.some((re) => re.test(u))) continue;
    if (!found.has(u)) found.set(u, rel(f));
  }
}
if (found.size === 0) ok(`khong co request ra ben ngoai (chi co ${SDK_URL})`);
else for (const [u, where] of found) fail(`URL ngoai khong duoc phep: ${u}  (trong ${where})`);

// ---- 5. kich thuoc ----
let total = 0;
let initial = 0;
const startupImages = new Set([
  "game/bg/default/bg_stack_default_sky.png",
  "game/stack/default/bldg_residential_default_mid.png",
  "game/stack/default/crane_rig_default_sprite.png",
  "game/stack/default/crane_hook_default_sprite.png",
]);
for (const f of files) {
  const s = fs.statSync(f).size;
  total += s;
  if ((/\.(?:html|css|js)$/i.test(f) && !f.endsWith(".map")) || startupImages.has(rel(f))) initial += s;
}
const mib = (n) => n / (1024 * 1024);
console.log(
  `       kich thuoc: initial ${mib(initial).toFixed(2)} MiB / total ${mib(total).toFixed(2)} MiB (gioi han ${LIMIT_MIB} MiB)`
);
if (mib(total) > LIMIT_MIB) fail(`tong bundle ${mib(total).toFixed(2)} MiB vuot gioi han ${LIMIT_MIB} MiB`);
else ok(`bundle nam trong gioi han ${LIMIT_MIB} MiB`);

console.log("");
if (errors) {
  console.error(`${errors} loi — phai sua truoc khi nop len YouTube.`);
  process.exit(1);
}
console.log("Tat ca kiem tra da qua. San sang zip de nop Test Suite.");
