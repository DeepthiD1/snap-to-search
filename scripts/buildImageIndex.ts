import path from 'path';
import fs from 'fs/promises';
import dotenv from 'dotenv';

import { loadPropertiesFromCsv } from '../src/data/csvPropertyLoader';
import { ImageEmbeddingService } from '../src/services/imageEmbeddingService';
import { float32ToBase64 } from '../src/services/embeddingIndex';

dotenv.config();

async function main() {
  const csvPath =
    process.argv[2] ?? path.join(process.cwd(), 'dataset', 'sample_listings.csv');
  const outPath =
    process.argv[3] ?? path.join(process.cwd(), 'dataset', 'image_index.json');

  const properties = loadPropertiesFromCsv(csvPath);

  const embedder = new ImageEmbeddingService();

  const vectors: Record<string, string> = {};
  let ok = 0;
  let skipped = 0;

  for (const p of properties) {
    const url = p.previewImageUrl || p.galleryImageUrls?.[0];
    if (!url) {
      skipped++;
      continue;
    }

    try {
      const vec = await embedder.embedFromUrl(url);
      vectors[p.propertyId] = float32ToBase64(vec);
      ok++;
      console.log(`[${ok}/${properties.length}] embedded ${p.propertyId}`);
    } catch (e: any) {
      skipped++;
      console.warn(`skip ${p.propertyId}: ${e?.message ?? e}`);
    }
  }

  const payload = {
    model: embedder.getModelId(),
    dim: 512,
    createdAt: new Date().toISOString(),
    vectors,
    stats: { total: properties.length, ok, skipped },
  };

  await fs.writeFile(outPath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`✅ wrote index: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
