import fs from "fs";
import path from "path";
import sharp from "sharp";

function listImages(dir: string) {
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .map((f) => path.join(dir, f));
}

// Simple dHash (difference hash) — works well and is lightweight.
// Output is a 64-bit hash as hex string.
async function dHash64Hex(imagePath: string): Promise<string> {
  const width = 9;  // 9 columns so we can compare adjacent pixels -> 8 comparisons
  const height = 8;

  const buf = await sharp(imagePath)
    .resize(width, height, { fit: "fill" })
    .grayscale()
    .raw()
    .toBuffer();

  // buf length = width * height
  // Compare each row: pixel[x] > pixel[x+1] => bit = 1
  let bits = "";
  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    for (let x = 0; x < width - 1; x++) {
      const left = buf[rowStart + x]!;
      const right = buf[rowStart + x + 1]!;
      bits += left > right ? "1" : "0";
    }
  }

  // bits length = 8*8 = 64
  // Convert to hex
  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    const chunk = bits.slice(i, i + 4);
    hex += parseInt(chunk, 2).toString(16);
  }
  return hex;
}

async function main() {
  const dir = path.join(process.cwd(), "dataset", "mls_images_10");
  if (!fs.existsSync(dir)) {
    console.error("Missing folder:", dir);
    process.exit(1);
  }

  const files = listImages(dir);
  if (!files.length) {
    console.error("No images found in:", dir);
    process.exit(1);
  }

  const out: Array<{ listingId: string; filename: string; hash: string }> = [];

  let i = 0;
  for (const filePath of files) {
    i += 1;
    const filename = path.basename(filePath);
    const listingId = filename.split(".")[0]; // assumes your filename starts with listingId
    const hash = await dHash64Hex(filePath);
    out.push({ listingId, filename, hash });
    console.log(`✅ [${i}/${files.length}] ${filename} -> ${hash}`);
  }

  const outPath = path.join(dir, "phash_index.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf-8");
  console.log("\nWrote:", outPath);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
