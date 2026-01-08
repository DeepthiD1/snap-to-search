import fs from "fs";
import path from "path";
import fetch from "node-fetch";

type AnyObj = Record<string, any>;

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function extFromUrl(url: string) {
  try {
    const u = new URL(url);
    const ext = path.extname(u.pathname);
    return ext || ".jpg";
  } catch {
    return ".jpg";
  }
}

async function downloadFile(url: string, outPath: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed: ${r.status} ${r.statusText}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(outPath, buf);
  return buf.length;
}

async function main() {
  const base = process.env.RE_API_BASE;
  const key = process.env.RE_API_KEY;

  if (!base || !key) {
    console.error("Missing RE_API_BASE or RE_API_KEY in .env");
    process.exit(1);
  }

  // ✅ Change these if you want another area
  const payload = {
    city: "Morgan Hill",
    state: "CA",
    active: true,
    size: 100,
  };

  const r = await fetch(`${base}/v2/MLSSearch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
    },
    body: JSON.stringify(payload),
  });

  const data: AnyObj = await r.json();
  if (!r.ok) {
    console.error("MLSSearch failed:", r.status, data);
    process.exit(1);
  }

  const results: AnyObj[] = Array.isArray(data?.data) ? data.data : [];
  console.log(`Got ${results.length} MLS results`);

  const outDir = path.join(process.cwd(), "dataset", "mls_images_10");
  ensureDir(outDir);

  let saved = 0;

  for (const item of results) {
    if (saved >= 10) break;

    const listingId = String(item?.listingId ?? item?.id ?? item?.listing?.mlsNumber ?? `row_${saved}`);
    const listing = item?.listing ?? {};
    const media = listing?.media ?? {};
    const url: string | undefined =
      media?.primaryListingImageUrl ?? listing?.public?.imageUrl ?? item?.public?.imageUrl;

    if (!url) {
      console.log(`- skip ${listingId} (no image url)`);
      continue;
    }

    const ext = extFromUrl(url);
    const outPath = path.join(outDir, `${listingId}${ext}`);

    try {
      const bytes = await downloadFile(url, outPath);
      saved += 1;
      console.log(`✅ [${saved}/10] saved ${listingId}${ext} (${Math.round(bytes / 1024)} KB)`);
    } catch (e: any) {
      console.log(`❌ failed ${listingId}: ${e?.message ?? String(e)}`);
    }
  }

  console.log(`\nDone. Saved ${saved} images to: ${outDir}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
