/**
 * Sinh icon PWA ra public/. Chạy một lần, kết quả commit luôn:
 *
 *   node scripts/make-icons.mjs
 *
 * Tự vẽ + tự đóng gói PNG bằng zlib có sẵn của Node, để khỏi thêm thư viện ảnh
 * (sharp/canvas) chỉ vì hai tấm hình tĩnh.
 */

import { crc32, deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BG = [15, 23, 42]; // slate-900, trùng themeColor
const FG = [255, 255, 255];

/** Toạ độ 0..1 cho dễ đổi kích thước. Chừa mép 10% để icon maskable không bị cắt. */
function inHouse(x, y) {
  if (y >= 0.3 && y <= 0.5) {
    const halfWidth = 0.3 * ((y - 0.3) / 0.2); // mái dốc
    if (Math.abs(x - 0.5) <= halfWidth) return true;
  }
  if (y > 0.5 && y <= 0.74 && Math.abs(x - 0.5) <= 0.21) {
    const inDoor = y >= 0.57 && Math.abs(x - 0.5) <= 0.065;
    return !inDoor;
  }
  return false;
}

function inRoundedSquare(x, y, radius) {
  const dx = Math.max(radius - x, 0, x - (1 - radius));
  const dy = Math.max(radius - y, 0, y - (1 - radius));
  return dx * dx + dy * dy <= radius * radius;
}

function render(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const samples = 3; // khử răng cưa bằng cách lấy 3×3 điểm mỗi pixel

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let fg = 0;

      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) / size;
          const y = (py + (sy + 0.5) / samples) / size;
          if (!inRoundedSquare(x, y, 0.22)) continue;
          bg++;
          if (inHouse(x, y)) fg++;
        }
      }

      const total = samples * samples;
      const alpha = Math.round((bg / total) * 255);
      const mix = bg === 0 ? 0 : fg / bg;
      const offset = (py * size + px) * 4;

      for (let channel = 0; channel < 3; channel++) {
        pixels[offset + channel] = Math.round(BG[channel] * (1 - mix) + FG[channel] * mix);
      }
      pixels[offset + 3] = alpha;
    }
  }

  return pixels;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function toPng(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // 8 bit mỗi kênh
  header[9] = 6; // RGBA
  // 10..12 = compression/filter/interlace, đều 0

  // Mỗi dòng ảnh phải có 1 byte filter đứng trước; 0 = không lọc.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let row = 0; row < size; row++) {
    pixels.copy(raw, row * (size * 4 + 1) + 1, row * size * 4, (row + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const publicDir = resolve(dirname(fileURLToPath(import.meta.url)), '../public');

for (const size of [192, 512, 180]) {
  const name = size === 180 ? 'apple-icon.png' : `icon-${size}.png`;
  const png = toPng(size, render(size));
  writeFileSync(resolve(publicDir, name), png);
  console.log(`${name} — ${size}×${size}, ${png.length} bytes`);
}
