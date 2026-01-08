import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import fetch from 'node-fetch';
import sharp from 'sharp';
import { createLogger } from './utils/logger';

dotenv.config();

const logger = createLogger('Server');
const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Serve downloaded MLS images from dataset/mls_images_10
// URL: http://localhost:4000/static/mls_images_10/<id>.jpg
app.use('/static/mls_images_10', express.static(path.join(process.cwd(), 'dataset', 'mls_images_10')));

type PHashIndexEntry = { listingId: string; filename: string; hash: string };

type ListingSummary = {
  listingId: string;
  url?: string;
  addressLine?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  listPrice?: number;
  bedrooms?: number;
  bathrooms?: number;
  livingArea?: number;
  yearBuilt?: number;
  status?: string;
};

const PHASH_INDEX_PATH =
  process.env.PHASH_INDEX_PATH ??
  path.join(process.cwd(), 'dataset', 'mls_images_10', 'phash_index.json');

function hammingDistanceHex(a: string, b: string): number {
  const x = BigInt('0x' + a) ^ BigInt('0x' + b);
  let v = x;
  let count = 0;
  while (v) {
    count += Number(v & 1n);
    v >>= 1n;
  }
  return count;
}

// 64-bit dHash => 16 hex chars
async function dHash64HexFromBuffer(buf: Buffer): Promise<string> {
  const { data } = await sharp(buf)
    .grayscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = data[y * 9 + x]!;
      const right = data[y * 9 + (x + 1)]!;
      bits += left > right ? '1' : '0';
    }
  }

  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex.padStart(16, '0');
}

// ---- RealEstateAPI MLSDetail fetch (to show listing info) ----
// Uses POST /v2/MLSDetail with body { listing_id: "..." } :contentReference[oaicite:1]{index=1}
const LISTING_CACHE_TTL_MS = 10 * 60 * 1000;
const listingCache = new Map<string, { ts: number; value: ListingSummary | null }>();

function pickListingSummary(listingId: string, raw: any): ListingSummary {
  // Best-effort extraction (RealEstateAPI schemas can vary by feed)
  const listing = raw?.listing ?? raw?.data?.listing ?? raw?.result?.listing ?? raw?.property?.listing ?? raw;

  const address = listing?.address ?? raw?.address ?? {};
  const property = listing?.property ?? raw?.property ?? {};
  const media = listing?.media ?? raw?.media ?? {};

  const addressLine =
    address?.unparsedAddress
      ? `${address.unparsedAddress}${address.city ? `, ${address.city}` : ''}${address.stateOrProvince ? ` ${address.stateOrProvince}` : ''}${address.zipCode ? ` ${address.zipCode}` : ''}`
      : undefined;

  const listPrice =
    typeof listing?.listPriceLow === 'number'
      ? listing.listPriceLow
      : typeof listing?.listPrice === 'number'
        ? listing.listPrice
        : undefined;

  return {
    listingId,
    url: listing?.url ?? raw?.url,
    addressLine,
    city: address?.city,
    state: address?.stateOrProvince,
    zipCode: address?.zipCode,
    listPrice,
    bedrooms: typeof property?.bedroomsTotal === 'number' ? property.bedroomsTotal : undefined,
    bathrooms: typeof property?.bathroomsTotal === 'number' ? property.bathroomsTotal : undefined,
    livingArea: typeof property?.livingArea === 'number' ? property.livingArea : undefined,
    yearBuilt: typeof property?.yearBuilt === 'number' ? property.yearBuilt : undefined,
    status: listing?.standardStatus ?? listing?.customStatus,
  };
}

async function getListingSummary(listingId: string): Promise<ListingSummary | null> {
  const cached = listingCache.get(listingId);
  if (cached && Date.now() - cached.ts < LISTING_CACHE_TTL_MS) return cached.value;

  const base = process.env.RE_API_BASE;
  const key = process.env.RE_API_KEY;
  if (!base || !key) {
    logger.warn('Missing RE_API_BASE or RE_API_KEY; returning pHash-only matches');
    listingCache.set(listingId, { ts: Date.now(), value: null });
    return null;
  }

  try {
    const r = await fetch(`${base}/v2/MLSDetail`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
      },
      body: JSON.stringify({ listing_id: listingId }),
    });

    const text = await r.text();
    if (!r.ok) {
      logger.warn('MLSDetail failed', { listingId, status: r.status, body: text.slice(0, 200) });
      listingCache.set(listingId, { ts: Date.now(), value: null });
      return null;
    }

    const json = JSON.parse(text);
    const summary = pickListingSummary(listingId, json);
    listingCache.set(listingId, { ts: Date.now(), value: summary });
    return summary;
  } catch (err) {
    logger.warn('MLSDetail fetch error', { listingId, error: (err as Error).message });
    listingCache.set(listingId, { ts: Date.now(), value: null });
    return null;
  }
}

// ---- Routes ----
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'snap-to-search', docs: '/api/health' });
});
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'snap-to-search', timestamp: new Date().toISOString() });
});

app.post('/api/phash-test', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'photo is required' });
    if (!fs.existsSync(PHASH_INDEX_PATH)) {
      return res.status(500).json({
        error: `Missing pHash index file at ${PHASH_INDEX_PATH}. Create it first.`,
      });
    }

    const index = JSON.parse(fs.readFileSync(PHASH_INDEX_PATH, 'utf8')) as PHashIndexEntry[];
    const queryHash = await dHash64HexFromBuffer(req.file.buffer);

    const scored = index
      .map((e) => ({
        listingId: e.listingId,
        filename: e.filename,
        hash: e.hash,
        distance: hammingDistanceHex(queryHash, e.hash),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5);

    const origin = `${req.protocol}://${req.get('host')}`;

    // Fetch listing details for top 5 (in parallel)
    const details = await Promise.all(scored.map((m) => getListingSummary(m.listingId)));

    const top = scored.map((m, idx) => ({
      ...m,
      previewImageUrl: `${origin}/static/mls_images_10/${m.filename}`,
      listing: details[idx], // may be null if MLSDetail not permitted
    }));

    return res.json({ queryHash, top });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message || 'pHash failed' });
  }
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  logger.info(`Snap-to-Search (pHash + listing details) listening on port ${port}`);
});
