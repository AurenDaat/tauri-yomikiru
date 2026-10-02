/**
 * Minimal, streaming-friendly ZIP (CBZ) reader.
 *
 * It reads the END-OF-CENTRAL-DIRECTORY + central directory only, then
 * extracts individual entries on demand with Blob.slice + DecompressionStream.
 * A whole archive is NEVER read into memory or written to disk.
 */

export interface ZipEntry {
  name: string;
  offset: number; // local header offset
  compressedSize: number;
  uncompressedSize: number;
  method: number;
}

const EOCD_SIG = 0x06054b50;
const EOCD64_LOC_SIG = 0x07064b50;
const CD_SIG = 0x02014b50;

async function view(blob: Blob, start: number, end?: number): Promise<DataView> {
  const buf = await blob.slice(start, end).arrayBuffer();
  return new DataView(buf);
}

export async function readZipIndex(file: Blob): Promise<ZipEntry[]> {
  const size = file.size;
  if (size < 22) throw new Error("archive too small");
  const tailLen = Math.min(size, 66 * 1024);
  const tailStart = size - tailLen;
  const tail = await view(file, tailStart);

  let eocd = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (tail.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip archive (no EOCD)");

  let count = tail.getUint16(eocd + 10, true);
  let cdSize = tail.getUint32(eocd + 12, true);
  let cdOffset = tail.getUint32(eocd + 16, true);

  if (cdOffset === 0xffffffff || cdSize === 0xffffffff || count === 0xffff) {
    for (let i = eocd - 20; i >= 0; i--) {
      if (tail.getUint32(i, true) === EOCD64_LOC_SIG) {
        const z64 = Number(tail.getBigUint64(i + 8, true));
        const z = await view(file, z64, z64 + 56);
        count = Number(z.getBigUint64(32, true));
        cdSize = Number(z.getBigUint64(40, true));
        cdOffset = Number(z.getBigUint64(48, true));
        break;
      }
    }
  }

  const cd = await view(file, cdOffset, cdOffset + cdSize);
  const utf8 = new TextDecoder("utf-8");
  const entries: ZipEntry[] = [];
  let p = 0;
  while (p + 46 <= cd.byteLength && cd.getUint32(p, true) === CD_SIG) {
    const method = cd.getUint16(p + 10, true);
    let compressedSize = cd.getUint32(p + 20, true);
    let uncompressedSize = cd.getUint32(p + 24, true);
    const nameLen = cd.getUint16(p + 28, true);
    const extraLen = cd.getUint16(p + 30, true);
    const commentLen = cd.getUint16(p + 32, true);
    let offset = cd.getUint32(p + 42, true);
    const nameBytes = new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen);
    const name = utf8.decode(nameBytes);

    if (offset === 0xffffffff || compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      // scan zip64 extended info field
      let q = p + 46 + nameLen;
      const endExtra = q + extraLen;
      while (q + 4 <= endExtra) {
        const hid = cd.getUint16(q, true);
        const hsize = cd.getUint16(q + 2, true);
        let r = q + 4;
        if (hid === 0x0001) {
          if (uncompressedSize === 0xffffffff) {
            uncompressedSize = Number(cd.getBigUint64(r, true));
            r += 8;
          }
          if (compressedSize === 0xffffffff) {
            compressedSize = Number(cd.getBigUint64(r, true));
            r += 8;
          }
          if (offset === 0xffffffff) offset = Number(cd.getBigUint64(r, true));
        }
        q += 4 + hsize;
      }
    }

    entries.push({ name, offset, compressedSize, uncompressedSize, method });
    p += 46 + nameLen + extraLen + commentLen;
    if (entries.length > 100000) break;
  }
  if (!entries.length) throw new Error("empty or unreadable archive");
  return entries;
}

export async function extractEntry(file: Blob, e: ZipEntry): Promise<Blob> {
  const head = await view(file, e.offset, e.offset + 30);
  if (head.getUint32(0, true) !== 0x04034b50) throw new Error("bad local header");
  const nameLen = head.getUint16(26, true);
  const extraLen = head.getUint16(28, true);
  const start = e.offset + 30 + nameLen + extraLen;
  const raw = file.slice(start, start + e.compressedSize);
  if (e.method === 0) return raw;
  if (e.method === 8) {
    if (typeof DecompressionStream === "undefined")
      throw new Error("deflate unsupported on this platform");
    const stream = raw.stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return await new Response(stream).blob();
  }
  throw new Error(`unsupported compression method ${e.method}`);
}

export async function extractText(file: Blob, e: ZipEntry): Promise<string> {
  const blob = await extractEntry(file, e);
  return await blob.text();
}
