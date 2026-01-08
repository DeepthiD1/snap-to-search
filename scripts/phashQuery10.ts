import fs from "fs";
import path from "path";
import sharp from "sharp";

type IndexRow = { listingId: string; filename: string; hash: string };

function listIndexPath() {
  return path.join(process.cwd(), "dataset", "mls_images_10", "phash_index.json");
}

// dHash 64-bit -> hex string (same as before)
async function dHash64Hex(imagePath: string): Promise<string> {
  const width = 9;
  const height = 8;

  const buf = await sharp(imagePath)
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

const BITCOUNT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let x = i, c = 0;
  while (x) { x &= x - 1; c++; }
  BITCOUNT[i] = c;
}

function hexToBuf(hex: string) {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex length");
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

async function main() {
  const queryPath = process.argv[2];
  if (!queryPath) {
    console.error('Usage: npx ts-node scripts/phashQuery10.ts "C:\\path\\to\\query.jpg"');
    process.exit(1);
  }
  if (!fs.existsSync(queryPath)) {
    console.error("Query image not found:", queryPath);
    process.exit(1);
  }

  const indexPath = listIndexPath();
  if (!fs.existsSync(indexPath)) {
    console.error("Missing phash index:", indexPath);
    process.exit(1);
  }

  const rows: IndexRow[] = JSON.parse(fs.readFileSync(indexPath, "utf-8"));

  const qHash = await dHash64Hex(queryPath);
  console.log("Query hash:", qHash);

  const scored = rows
    .map((r) => ({
      ...r,
      distance: hammingHex64(qHash, r.hash),
    }))
    .sort((a, b) => a.distance - b.distance);

  console.log("\nTop matches by pHash (lower distance = more similar):");
  for (const item of scored.slice(0, 5)) {
    console.log(`- ${item.listingId}  dist=${item.distance}  file=${item.filename}  hash=${item.hash}`);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
