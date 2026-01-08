import fs from "fs";
import path from "path";
import sharp from "sharp";

export type PHashIndexRow = { listingId: string; filename: string; hash: string };

const BITCOUNT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let x = i, c = 0;
  while (x) { x &= x - 1; c++; }
  BITCOUNT[i] = c;
}

function hexToBuf(hex: string) {
  return Buffer.from(hex, "hex");
}

function hammingHex64(aHex: string, bHex: string): number {
  const a = hexToBuf(aHex);
  const b = hexToBuf(bHex);
  if (a.length !== b.length) throw new Error("Hash length mismatch");
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    dist += BITCOUNT[(a[i]! ^ b[i]!) & 0xff]!;
  }
  return dist;
}

// dHash 64-bit -> hex
export async function dHash64HexFromBuffer(imageBuf: Buffer): Promise<string> {
  const width = 9;
  const height = 8;

  const buf = await sharp(imageBuf)
    .resize(width, height, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer();

  let bits = "";
  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    for (let x = 0; x < width - 1; x++) {
      const left = buf[rowStart + x]!;
      const right = buf[rowStart + x + 1]!;
      bits += left > right ? "1" : "0";
    }
  }

  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

export function loadPHashIndex(indexPath: string): PHashIndexRow[] {
  const raw = fs.readFileSync(indexPath, "utf-8");
  return JSON.parse(raw) as PHashIndexRow[];
}

export function queryPHashTopK(params: {
  queryHashHex: string;
  index: PHashIndexRow[];
  k: number;
}) {
  const { queryHashHex, index, k } = params;

  return index
    .map((r) => ({
      ...r,
      distance: hammingHex64(queryHashHex, r.hash),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k);
}

export function defaultIndexPath() {
  return path.join(process.cwd(), "dataset", "mls_images_10", "phash_index.json");
}

export function defaultImagesDir() {
  return path.join(process.cwd(), "dataset", "mls_images_10");
}
