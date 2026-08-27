/**
 * 程序化像素地图渲染:把 Blueprint 画成 904×624 的 RGBA PNG(base64),
 * 零运行时依赖(node zlib 内置)。用于动态生成的 world(D31/D32 的
 * 「蓝图控制图」降级路径);持真实 IMAGE/VISION 密钥后可换成 AI 生图。
 */
import zlib from "node:zlib";
import type { WorldBlueprint } from "@ai-town/shared";

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(data.length + 8, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const ihdr = new Uint8Array(13);
  const view = new DataView(ihdr.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const scanlines = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    scanlines[y * (width * 4 + 1)] = 0;
    scanlines.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  }
  const parts = [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from(chunk("IHDR", ihdr)),
    Buffer.from(chunk("IDAT", new Uint8Array(zlib.deflateSync(scanlines, { level: 6 })))),
    Buffer.from(chunk("IEND", new Uint8Array(0))),
  ];
  return Buffer.concat(parts);
}

type RGBA = [number, number, number, number];

const hexToRgba = (hex: string): RGBA => {
  const value = parseInt(hex.replace("#", ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
};

function seedNoise(seed: number): (x: number, y: number) => number {
  let state = seed >>> 0;
  return (x: number, y: number) => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return (state ^ (x * 73856093) ^ (y * 19349663)) & 255;
  };
}

const ROOF_PALETTE = ["#d6925b", "#b98a5e", "#a8897a", "#8a9a5b", "#c48d68", "#9a8a5f"];
const WATER = hexToRgba("#4a86b8");
const WATER_DEEP = hexToRgba("#3a6c9c");
const GRASS = hexToRgba("#93bf74");
const GRASS_DARK = hexToRgba("#83b066");
const ROAD = hexToRgba("#b9a68a");
const ROAD_EDGE = hexToRgba("#9a8a70");
const PLAZA = hexToRgba("#c9b491");
const DOOR = hexToRgba("#5a4632");
const OUTLINE = hexToRgba("#33402c");

function lerp(a: RGBA, b: RGBA, t: number): RGBA {
  return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t), 255];
}

export function renderWorldMapBase64(blueprint: WorldBlueprint): string {
  const width = blueprint.canvas.width;
  const height = blueprint.canvas.height;
  const size = width * height * 4;
  const pixels = new Uint8Array(size);
  const noise = seedNoise(0x1a2b3c ^ [...blueprint.worldId].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 0));

  const set = (x: number, y: number, color: RGBA) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = (y * width + x) * 4;
    pixels[index] = color[0];
    pixels[index + 1] = color[1];
    pixels[index + 2] = color[2];
    pixels[index + 3] = color[3];
  };
  const fillRect = (x: number, y: number, w: number, h: number, color: RGBA) => {
    for (let py = Math.max(0, y); py < Math.min(height, y + h); py += 1) {
      for (let px = Math.max(0, x); px < Math.min(width, x + w); px += 1) set(px, py, color);
    }
  };

  // 草地底 + 噪点
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      set(x, y, noise(x, y) > 135 ? GRASS : GRASS_DARK);
    }
  }

  for (const location of blueprint.locations) {
    const { x, y, width: w, height: h } = location.bounds;
    if (location.kind === "water") {
      fillRect(x, y, w, h, WATER);
      for (let py = y + 4; py < y + h; py += 12) {
        for (let px = x + 2; px < x + w - 2; px += 10) {
          if (noise(px, py) > 100) set(px, py, WATER_DEEP);
        }
      }
    } else if (location.kind === "plaza") {
      fillRect(x, y, w, h, PLAZA);
      for (let py = y; py < y + h; py += 8) fillRect(x, py, w, 1, ROAD_EDGE);
      for (let px = x; px < x + w; px += 8) fillRect(px, y, 1, h, ROAD_EDGE);
    } else if (location.kind === "building") {
      const roofIndex = Math.abs([...location.id].reduce((acc, ch) => (acc * 33 + ch.charCodeAt(0)) >>> 0, 0)) % ROOF_PALETTE.length;
      const roof = hexToRgba(ROOF_PALETTE[roofIndex]);
      fillRect(x - 2, y - 2, w + 4, h + 4, OUTLINE);
      fillRect(x, y, w, h, roof);
      for (let px = x + 6; px < x + w - 4; px += 14) fillRect(px, y + 4, 6, 6, lerp(roof, hexToRgba("#5c4a3a"), 0.25));
      const entrance = location.entrances[0];
      if (entrance) fillRect(Math.round(entrance.x) - 3, Math.round(entrance.y) - 6, 7, 8, DOOR);
    } else {
      fillRect(x, y, w, h, GRASS);
    }
  }

  // 道路:按折线描边
  for (const path of blueprint.paths) {
    for (let i = 1; i < path.points.length; i += 1) {
      const from = path.points[i - 1];
      const to = path.points[i];
      const half = Math.floor(path.width / 2);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)));
      for (let step = 0; step <= steps; step += 1) {
        const cx = Math.round(from.x + (dx * step) / steps);
        const cy = Math.round(from.y + (dy * step) / steps);
        fillRect(cx - half - 1, cy - half - 1, path.width + 2, path.width + 2, ROAD_EDGE);
        fillRect(cx - half, cy - half, path.width, path.width, ROAD);
      }
    }
  }

  // 出生点标记(淡青色圆点,与行走区域图层同色系)
  for (const spawn of blueprint.spawnPoints) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        if (dx * dx + dy * dy <= 16) set(Math.round(spawn.position.x) + dx, Math.round(spawn.position.y) + dy, [96, 200, 200, 255]);
      }
    }
  }

  return `data:image/png;base64,${encodePng(width, height, pixels).toString("base64")}`;
}
