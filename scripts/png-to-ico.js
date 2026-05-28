// Minimal PNG -> ICO converter (Vista+ embedded-PNG form).
// usage: node scripts/png-to-ico.js <in.png> <out.ico> [size]
const fs = require('fs');
const path = require('path');

const [, , inFile, outFile, sizeArg] = process.argv;
if (!inFile || !outFile) {
  console.error('usage: png-to-ico <in.png> <out.ico> [size]');
  process.exit(1);
}

const png = fs.readFileSync(path.resolve(inFile));
// PNG dimensions live at bytes 16-23 (IHDR after 8-byte signature + 4 len + 4 type)
const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
const declared = sizeArg ? parseInt(sizeArg, 10) : Math.min(width, 256);
// In ICO header, 0 means 256.
const w = declared >= 256 ? 0 : declared;
const h = declared >= 256 ? 0 : declared;

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);       // reserved
header.writeUInt16LE(1, 2);       // type 1 = ICO
header.writeUInt16LE(1, 4);       // count

const entry = Buffer.alloc(16);
entry.writeUInt8(w, 0);
entry.writeUInt8(h, 1);
entry.writeUInt8(0, 2);           // palette
entry.writeUInt8(0, 3);           // reserved
entry.writeUInt16LE(1, 4);        // planes
entry.writeUInt16LE(32, 6);       // bit depth
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(6 + 16, 12);  // offset to image data

const out = Buffer.concat([header, entry, png]);
fs.writeFileSync(path.resolve(outFile), out);
console.log(`wrote ${outFile} (${out.length} bytes, declared ${declared}x${declared}, real ${width}x${height})`);
