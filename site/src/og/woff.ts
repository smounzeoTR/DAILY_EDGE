// WOFF 1.0 → TrueType/OpenType (sfnt) at build time, for resvg (which reads TTF/OTF only).
// Each table is stored zlib-compressed when that saves space (W3C WOFF 1.0 § 5).
import { inflateSync } from 'node:zlib';

export function woffToSfnt(woff: Buffer): Buffer {
  if (woff.readUInt32BE(0) !== 0x774f4646) throw new Error('not a WOFF 1.0 file');
  const flavor = woff.readUInt32BE(4);
  const numTables = woff.readUInt16BE(12);
  const tables: { tag: number; checksum: number; data: Buffer }[] = [];
  for (let i = 0; i < numTables; i++) {
    const entry = 44 + i * 20;
    const offset = woff.readUInt32BE(entry + 4);
    const compLength = woff.readUInt32BE(entry + 8);
    const origLength = woff.readUInt32BE(entry + 12);
    const raw = woff.subarray(offset, offset + compLength);
    tables.push({
      tag: woff.readUInt32BE(entry),
      checksum: woff.readUInt32BE(entry + 16),
      data: compLength < origLength ? inflateSync(raw) : Buffer.from(raw),
    });
  }
  let searchRange = 1;
  let entrySelector = 0;
  while (searchRange * 2 <= numTables) {
    searchRange *= 2;
    entrySelector++;
  }
  const header = Buffer.alloc(12 + numTables * 16);
  header.writeUInt32BE(flavor, 0);
  header.writeUInt16BE(numTables, 4);
  header.writeUInt16BE(searchRange * 16, 6);
  header.writeUInt16BE(entrySelector, 8);
  header.writeUInt16BE(numTables * 16 - searchRange * 16, 10);
  const parts: Buffer[] = [header];
  let offset = header.length;
  tables.forEach((table, i) => {
    const record = 12 + i * 16;
    header.writeUInt32BE(table.tag, record);
    header.writeUInt32BE(table.checksum, record + 4);
    header.writeUInt32BE(offset, record + 8);
    header.writeUInt32BE(table.data.length, record + 12);
    const padded = Buffer.alloc((table.data.length + 3) & ~3);
    table.data.copy(padded);
    parts.push(padded);
    offset += padded.length;
  });
  return Buffer.concat(parts);
}
