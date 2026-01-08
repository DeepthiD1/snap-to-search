import fs from "fs";
import path from "path";
import sharp from "sharp";

type CandidateHashRecord = {
  listingId: string;
  filename: string;
  hash: string;
};

function listImages(dir: string) {
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .map((f) => path.join(dir, f));
}

function dedupeHashRecords(entries: CandidateHashRecord[]): CandidateHashRecord[] {
  const seen = new Map<string, CandidateHashRecord>();
  for (const entry of entries) {
    const key = entry.listingId || entry.filename;
    if (!key) {
      continue;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.set(key, entry);
  }
  return Array.from(seen.values());
}

// Simple dHash (difference hash) — works well and is lightweight.
async function dHash64Hex(imagePath: string): Promise<string> {
  const width = 9; // 9 columns so we can compare adjacent pixels -> 8 comparisons
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

  const indexPath = path.join(dir, "phash_index.json");
  const existing: CandidateHashRecord[] = [];
  if (fs.existsSync(indexPath)) {
    try {
      const content = fs.readFileSync(indexPath, "utf-8");
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        existing.push(...parsed);
      }
    } catch (error) {
      console.warn("Failed to parse existing phash_index.json, overwriting", error);
    }
  }

  const knownFilenames = new Set(existing.map((entry) => entry.filename));
  const newEntries: CandidateHashRecord[] = [];

  for (const filePath of files) {
    const filename = path.basename(filePath);
    if (knownFilenames.has(filename)) {
      continue;
    }

    const listingId = path.parse(filename).name;
    const hash = await dHash64Hex(filePath);
    newEntries.push({ listingId, filename, hash });
    console.log(`✅ new [${newEntries.length}] ${filename} -> ${hash}`);
  }

  const combined = dedupeHashRecords([...existing, ...newEntries]);

  if (!combined.length) {
    console.log("No hashes available.");
    return;
  }

  const shouldWrite = newEntries.length > 0 || combined.length !== existing.length;
  if (!shouldWrite) {
    console.log("No new images to hash.");
    return;
  }

  fs.writeFileSync(indexPath, JSON.stringify(combined, null, 2), "utf-8");
  console.log(`\nWrote ${combined.length} entries to ${indexPath} (${newEntries.length} new)`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
