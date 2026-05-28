// Generate a multi-resolution ICO (16, 32, 48, 256) with BMP-format entries.
// electron-builder requires >= 256x256; NSIS prefers proper sizes; both happy.
const fs = require('fs');

const out = process.argv[2] || 'assets/icon.ico';
const sizes = [16, 32, 48, 256];

function renderBMP(size) {
  // BGRA pixels, bottom-up. Simple ring on dark background.
  const accent = [0xFF, 0x66, 0x33, 0xFF];   // BGRA orange
  const bg     = [0x18, 0x18, 0x18, 0xFF];   // dark
  const pixels = Buffer.alloc(size * size * 4);
  const cx = (size - 1) / 2, cy = (size - 1) / 2;
  const rOuter = size * 0.46, rInner = size * 0.18;
  for (let y = 0; y < size; y++) {
    const yy = size - 1 - y;
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = yy - cy;
      const d = Math.hypot(dx, dy);
      const col = (d <= rOuter && d >= rInner) ? accent : bg;
      const off = (y * size + x) * 4;
      pixels[off]     = col[0];
      pixels[off + 1] = col[1];
      pixels[off + 2] = col[2];
      pixels[off + 3] = col[3];
    }
  }
  const andMaskRowBytes = Math.ceil(size / 32) * 4;
  const andMask = Buffer.alloc(andMaskRowBytes * size);

  const bih = Buffer.alloc(40);
  bih.writeUInt32LE(40, 0);
  bih.writeInt32LE(size, 4);
  bih.writeInt32LE(size * 2, 8);   // XOR + AND combined
  bih.writeUInt16LE(1, 12);
  bih.writeUInt16LE(32, 14);
  bih.writeUInt32LE(0, 16);
  bih.writeUInt32LE(pixels.length, 20);
  return Buffer.concat([bih, pixels, andMask]);
}

const images = sizes.map(renderBMP);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);

let offset = 6 + 16 * sizes.length;
const entries = sizes.map((size, i) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0);
  entry.writeUInt8(size >= 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(images[i].length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += images[i].length;
  return entry;
});

fs.writeFileSync(out, Buffer.concat([header, ...entries, ...images]));
console.log(`wrote ${out} with sizes ${sizes.join(',')} (${offset} bytes total)`);
