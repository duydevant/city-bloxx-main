import { PHYSICS_VERSION, RULESET_VERSION } from "../../../packages/city-bloxx-core/src/index";

export const SHARE_CARD_WIDTH = 1200;
export const SHARE_CARD_HEIGHT = 630;
export const SHARE_CARD_MAX_NAME_CHARS = 24;

export interface ShareCardInput {
  towerId: string;
  displayName: string;
  mode: "quick" | "daily" | "skyline-album";
  population: number;
  height: number;
  accuracy: number;
  perfectCount: number;
  rating: string;
  dateUTC?: string;
  physicsVersion?: string;
  rulesetVersion?: string;
}

export interface ShareCardRenderOutput {
  png: Uint8Array;
  width: number;
  height: number;
  locale: "en" | "vi";
  truncatedDisplayName: string;
  overflow: boolean;
  lines: string[];
  exactNumbers: {
    population: number;
    height: number;
    accuracy: string;
    perfectCount: number;
    physicsVersion: string;
    rulesetVersion: string;
  };
}

export function truncateShareDisplayName(name: string, maxChars = SHARE_CARD_MAX_NAME_CHARS): string {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars - 3).trimEnd()}...`;
}

// 5x7 ASCII bitmap font for deterministic server-side text rendering without native canvas dependencies
const GLYPHS: Record<string, readonly number[]> = {
  " ": [0, 0, 0, 0, 0, 0, 0],
  "0": [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  "1": [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  "2": [0b01110, 0b10001, 0b00001, 0b00110, 0b01000, 0b10000, 0b11111],
  "3": [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  "4": [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  "5": [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  "6": [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  "7": [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  "8": [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  "9": [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11100, 0b10010, 0b10001, 0b10001, 0b10001, 0b10010, 0b11100],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b10010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  ".": [0, 0, 0, 0, 0, 0b00100, 0b00100],
  ":": [0, 0b00100, 0, 0, 0, 0b00100, 0],
  "-": [0, 0, 0, 0b11111, 0, 0, 0],
  "%": [0b11001, 0b11010, 0b00010, 0b00100, 0b01000, 0b01011, 0b10011],
  "/": [0b00001, 0b00010, 0b00010, 0b00100, 0b01000, 0b01000, 0b10000],
  "#": [0b01010, 0b11111, 0b01010, 0b01010, 0b11111, 0b01010, 0b00000],
};

function normalizeGlyphText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "D")
    .toUpperCase();
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length, false);
  for (let i = 0; i < 4; i++) {
    out[4 + i] = type.charCodeAt(i);
  }
  out.set(data, 8);
  const crcInput = out.subarray(4, 8 + data.length);
  view.setUint32(8 + data.length, crc32(crcInput), false);
  return out;
}

function zlibStore(raw: Uint8Array): Uint8Array {
  const maxBlock = 65535;
  const numBlocks = Math.max(1, Math.ceil(raw.length / maxBlock));
  const out = new Uint8Array(2 + numBlocks * 5 + raw.length + 4);
  out[0] = 0x78; // CMF: Deflate, 32K window
  out[1] = 0x01; // FLG: no preset dictionary, check bits valid (0x7801 % 31 === 0)
  let pos = 2;
  let offset = 0;
  for (let b = 0; b < numBlocks; b++) {
    const isFinal = b === numBlocks - 1;
    const len = Math.min(maxBlock, raw.length - offset);
    const nlen = (~len) & 0xffff;
    out[pos++] = isFinal ? 0x01 : 0x00;
    out[pos++] = len & 0xff;
    out[pos++] = (len >>> 8) & 0xff;
    out[pos++] = nlen & 0xff;
    out[pos++] = (nlen >>> 8) & 0xff;
    out.set(raw.subarray(offset, offset + len), pos);
    pos += len;
    offset += len;
  }
  // Adler-32 checksum
  let s1 = 1;
  let s2 = 0;
  for (let i = 0; i < raw.length; i++) {
    s1 = (s1 + raw[i]) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  const adler = ((s2 << 16) | s1) >>> 0;
  const view = new DataView(out.buffer);
  view.setUint32(pos, adler, false);
  return out;
}

export function renderShareCardPng(
  input: ShareCardInput,
  locale: "en" | "vi" = "en",
): ShareCardRenderOutput {
  if (!Number.isFinite(input.population) || input.population < 0) {
    throw new Error("Share card requires non-negative finite population.");
  }
  if (!Number.isFinite(input.height) || input.height < 0) {
    throw new Error("Share card requires non-negative finite height.");
  }
  const width = SHARE_CARD_WIDTH;
  const height = SHARE_CARD_HEIGHT;
  const truncatedDisplayName = truncateShareDisplayName(input.displayName);
  const physicsVersion = input.physicsVersion ?? PHYSICS_VERSION;
  const rulesetVersion = input.rulesetVersion ?? RULESET_VERSION;
  const accuracyStr = `${input.accuracy.toFixed(1)}%`;

  const modeLabel =
    input.mode === "daily"
      ? locale === "vi"
        ? `THAP HANG NGAY ${input.dateUTC ?? ""}`.trim()
        : `DAILY TOWER ${input.dateUTC ?? ""}`.trim()
      : input.mode === "skyline-album"
        ? locale === "vi"
          ? "ALBUM DUONG CHAN TROI"
          : "SKYLINE ALBUM"
        : locale === "vi"
          ? "XAY THAP NHANH TIEU CHUAN"
          : "QUICK TOWER STANDARD";

  const lines =
    locale === "vi"
      ? [
          "CITY BLOXX",
          modeLabel,
          `KIEN TRUC SU: ${truncatedDisplayName}`,
          `DAN SO: ${input.population}`,
          `SO TANG: ${input.height} / HANG: ${input.rating}`,
          `DO CHINH XAC: ${accuracyStr} / PERFECT: ${input.perfectCount}`,
          `PHIEN BAN: ${physicsVersion} / ${rulesetVersion}`,
        ]
      : [
          "CITY BLOXX",
          modeLabel,
          `ARCHITECT: ${truncatedDisplayName}`,
          `POPULATION: ${input.population}`,
          `FLOORS: ${input.height} / RATING: ${input.rating}`,
          `ACCURACY: ${accuracyStr} / PERFECT: ${input.perfectCount}`,
          `VERIFIED: ${physicsVersion} / ${rulesetVersion}`,
        ];

  // RGB scanlines with 1 filter byte per row
  const stride = 1 + width * 3;
  const raw = new Uint8Array(stride * height);

  const setPixel = (x: number, y: number, r: number, g: number, b: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const offset = y * stride + 1 + x * 3;
    raw[offset] = r;
    raw[offset + 1] = g;
    raw[offset + 2] = b;
  };

  const fillRect = (x0: number, y0: number, w: number, h: number, r: number, g: number, b: number) => {
    const xStart = Math.max(0, Math.floor(x0));
    const yStart = Math.max(0, Math.floor(y0));
    const xEnd = Math.min(width, Math.floor(x0 + w));
    const yEnd = Math.min(height, Math.floor(y0 + h));
    for (let y = yStart; y < yEnd; y++) {
      let idx = y * stride + 1 + xStart * 3;
      for (let x = xStart; x < xEnd; x++) {
        raw[idx] = r;
        raw[idx + 1] = g;
        raw[idx + 2] = b;
        idx += 3;
      }
    }
  };

  // Background gradient
  fillRect(0, 0, width, height, 15, 29, 44);
  fillRect(36, 36, width - 72, height - 72, 23, 43, 64);
  // Left stats card panel
  fillRect(64, 64, 700, height - 128, 17, 34, 51);
  // Right tower silhouette preview panel
  fillRect(796, 64, 340, height - 128, 28, 56, 82);
  // Ground bar in preview panel
  fillRect(796, height - 110, 340, 46, 52, 82, 68);

  // Draw deterministic tower preview blocks proportional to verified height (capped at 16 visible tiers)
  const visibleBlocks = Math.max(1, Math.min(16, input.height || 1));
  const blockH = 22;
  const blockW = 140;
  const towerCenterX = 966;
  for (let i = 0; i < visibleBlocks; i++) {
    const by = height - 110 - (i + 1) * (blockH + 3);
    const bx = towerCenterX - Math.floor(blockW / 2);
    fillRect(bx, by, blockW, blockH, 241, 200, 75);
    fillRect(bx + 10, by + 5, 24, 10, 35, 62, 88);
    fillRect(bx + 58, by + 5, 24, 10, 35, 62, 88);
    fillRect(bx + 106, by + 5, 24, 10, 35, 62, 88);
  }

  let maxRightX = 0;
  const drawText = (text: string, x0: number, y0: number, scale: number, r: number, g: number, b: number) => {
    const norm = normalizeGlyphText(text);
    let cursorX = x0;
    for (let i = 0; i < norm.length; i++) {
      const ch = norm[i];
      const glyph = GLYPHS[ch] ?? GLYPHS[" "];
      for (let row = 0; row < 7; row++) {
        const bits = glyph[row];
        for (let col = 0; col < 5; col++) {
          if ((bits >> (4 - col)) & 1) {
            fillRect(cursorX + col * scale, y0 + row * scale, scale, scale, r, g, b);
          }
        }
      }
      cursorX += 6 * scale;
      if (cursorX > maxRightX) maxRightX = cursorX;
    }
  };

  drawText(lines[0], 96, 96, 5, 255, 223, 120);
  drawText(lines[1], 96, 156, 3, 125, 211, 252);
  drawText(lines[2], 96, 220, 3, 248, 250, 252);
  drawText(lines[3], 96, 286, 4, 250, 204, 21);
  drawText(lines[4], 96, 354, 3, 226, 232, 240);
  drawText(lines[5], 96, 414, 3, 226, 232, 240);
  drawText(lines[6], 96, 486, 2, 148, 163, 184);

  // Ensure text stays strictly inside the 700px left text panel (right edge = 764)
  const overflow = maxRightX > 764;
  setPixel(0, 0, 15, 29, 44);

  const ihdr = new Uint8Array(13);
  const ihdrView = new DataView(ihdr.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdr[8] = 8; // bit depth 8
  ihdr[9] = 2; // color type 2 (Truecolor RGB)
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlibStore(raw);
  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrChunk = pngChunk("IHDR", ihdr);
  const idatChunk = pngChunk("IDAT", compressed);
  const iendChunk = pngChunk("IEND", new Uint8Array(0));

  const png = new Uint8Array(
    signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length,
  );
  let pos = 0;
  png.set(signature, pos);
  pos += signature.length;
  png.set(ihdrChunk, pos);
  pos += ihdrChunk.length;
  png.set(idatChunk, pos);
  pos += idatChunk.length;
  png.set(iendChunk, pos);

  return {
    png,
    width,
    height,
    locale,
    truncatedDisplayName,
    overflow,
    lines,
    exactNumbers: {
      population: input.population,
      height: input.height,
      accuracy: accuracyStr,
      perfectCount: input.perfectCount,
      physicsVersion,
      rulesetVersion,
    },
  };
}
