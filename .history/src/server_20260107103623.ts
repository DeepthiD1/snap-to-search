import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import fetch from 'node-fetch';
import multer from 'multer';

import {
  dHash64HexFromBuffer,
  loadPHashIndex,
  queryPHashTopK,
  defaultIndexPath,
  defaultImagesDir,
} from './services/pHashService';

dotenv.config();

const app = express();

const corsOptions: cors.CorsOptions = {
  origin: true, // dev only
  credentials: true,
};

app.use(cors(corsOptions));

// multer for multipart/form-data photo upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Serve downloaded MLS images (for preview)
app.use('/static/mls_images_10', express.static(defaultImagesDir()));

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'snap-to-search', docs: '/api/health' });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'snap-to-search', timestamp: new Date().toISOString() });
});

function absUrl(req: express.Request, maybeRelative: string) {
  if (/^https?:\/\//i.test(maybeRelative)) return maybeRelative;
  const origin = `${req.protocol}://${req.get('host')}`;
  return `${origin}${maybeRelative.startsWith('/') ? '' : '/'}${maybeRelative}`;
}

type ListingSummary = {
  listingId: string;
  addressLine?: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number | null;
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
  listingUrl?: string | null;
};

async function fetchMlsDetail(listingId: string): Promise<ListingSummary | null> {
  const base = process.env.RE_API_BASE;
  const key = process.env.RE_API_KEY;

  // If you haven't set these, we can't enrich details
  if (!base || !key) return null;

  try {
    const r = await fetch(`${base}/v2/MLSDetail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
      },
      body: JSON.stringify({ listing_id: listingId }),
    });

    if (!r.ok) {
      const t = await r.text();
      console.warn('[MLSDetail] failed', { listingId, status: r.status, body: t.slice(0, 300) });
      return null;
    }

    const data: any = await r.json();

    // Try a few common shapes
    // RealEstateAPI MLSDetail returns the listing inside `data.data`
  const listing =
    data?.data ??
    data?.listing ??
    data?.result?.listing ??
    data?.data?.listing ??
    data;


    const address = listing?.address ?? listing?.public?.address ?? {};
    const property = listing?.property ?? {};
    const media = listing?.media ?? {};

    const addressLine =
      address?.unparsedAddress ??
      listing?.unparsedAddress ??
      listing?.addressLine ??
      undefined;

    const city = address?.city ?? undefined;
    const state = address?.stateOrProvince ?? address?.state ?? undefined;
    const zip = address?.zipCode ?? undefined;

    const beds = property?.bedroomsTotal ?? listing?.bedroomsTotal ?? null;
    const baths = property?.bathroomsTotal ?? listing?.bathroomsTotal ?? null;
    const sqft = property?.livingArea ?? listing?.livingArea ?? null;

    // price fields vary; MLSSearch has listPriceLow + leadTypes.mlsListingPrice
    const price =
      listing?.listPriceLow ??
      listing?.leadTypes?.mlsListingPrice ??
      listing?.listPrice ??
      null;

    const listingUrl = listing?.url ?? null;

    return {
      listingId,
      addressLine,
      city,
      state,
      zip,
      price,
      beds,
      baths,
      sqft,
      listingUrl,
    };
  } catch (err) {
    console.warn('[MLSDetail] exception', { listingId, error: (err as Error).message });
    return null;
  }
}

app.post('/api/phash-test', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'photo is required' });

    const indexPath = defaultIndexPath();
    const index = loadPHashIndex(indexPath);

    const queryHash = await dHash64HexFromBuffer(req.file.buffer);
    const top = queryPHashTopK({ queryHashHex: queryHash, index, k: 5 });

    // Enrich top-5 with listing details from RealEstateAPI (optional but recommended)
    const enriched = await Promise.all(
      top.map(async (t) => {
        const details = await fetchMlsDetail(t.listingId);
        return {
          listingId: t.listingId,
          filename: t.filename,
          hash: t.hash,
          distance: t.distance,
          previewImageUrl: absUrl(req, `/static/mls_images_10/${t.filename}`),
          details, // <- contains price/beds/sqft/url etc (or null)
        };
      })
    );

    res.json({ queryHash, top: enriched });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message || 'pHash failed' });
  }
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`[Server] Snap-to-Search (pHash-only) listening on port ${port}`);
});

