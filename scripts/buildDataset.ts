import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

interface ApiListing {
  [key: string]: any;
}

interface DatasetEntry {
  listingId: string;
  imageUrl: string;
  latitude: number;
  longitude: number;
  address?: string;
  locality?: string;
}

const args = process.argv.slice(2);
const shouldDownloadImages = args.includes('--download');

function getArgValue(flag: string): string | undefined {
  const prefix = `${flag}=`;
  const match = args.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

const TARGET_COUNT = Number(getArgValue('--target') ?? process.env.DATASET_TARGET ?? 100);
const PAGE_SIZE = Number(getArgValue('--pageSize') ?? process.env.DATASET_PAGE_SIZE ?? 50);
const MAX_REQUESTS = Number(process.env.DATASET_MAX_REQUESTS ?? 50);
const BASE_URL = (process.env.RE_API_BASE_URL ?? 'https://api.reapi.com/v1').replace(/\/$/, '');
const API_KEY = process.env.RE_API_KEY;
const LISTINGS_PATH =
  getArgValue('--endpoint') ??
  process.env.RE_API_LISTINGS_PATH ??
  '/listings';

if (!API_KEY) {
  console.error('RE_API_KEY is required in the environment to build the dataset.');
  process.exit(1);
}

const OUTPUT_DIR = path.resolve(process.cwd(), 'dataset');
const IMAGE_DIR = path.join(OUTPUT_DIR, 'images');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'listings.json');

async function ensureDirectories() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  if (shouldDownloadImages) {
    await fs.mkdir(IMAGE_DIR, { recursive: true });
  }
}

function extractListingId(listing: ApiListing): string | undefined {
  return (
    listing.listingId ??
    listing.id ??
    listing.propertyId ??
    listing.mlsId ??
    listing.uuid ??
    listing._id
  );
}

function extractCoordinates(listing: ApiListing): { latitude: number; longitude: number } | null {
  const lat =
    listing.latitude ??
    listing.lat ??
    listing.location?.latitude ??
    listing.location?.lat ??
    listing.coordinates?.latitude ??
    listing.coordinates?.lat;
  const lon =
    listing.longitude ??
    listing.lon ??
    listing.location?.longitude ??
    listing.location?.lon ??
    listing.coordinates?.longitude ??
    listing.coordinates?.lon;

  if (typeof lat === 'number' && typeof lon === 'number') {
    return { latitude: lat, longitude: lon };
  }
  return null;
}

function extractImageUrl(listing: ApiListing): string | undefined {
  const mediaArray = listing.media ?? listing.images ?? listing.photos ?? listing.gallery ?? [];
  const flattened = Array.isArray(mediaArray)
    ? mediaArray
    : typeof mediaArray === 'object'
    ? Object.values(mediaArray)
    : [];

  const directCandidates = [
    listing.previewImageUrl,
    listing.primaryImageUrl,
    listing.heroImageUrl,
    listing.imageUrl,
    listing.photoUrl,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  const mediaCandidates = flattened
    .map((item: any) => item?.url ?? item?.src ?? (typeof item === 'string' ? item : undefined))
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  return [...directCandidates, ...mediaCandidates][0];
}

function extractAddress(listing: ApiListing): { address?: string; locality?: string } {
  const addressParts = [
    listing.address?.line1,
    listing.address?.line2,
    listing.address?.city,
    listing.address?.state,
    listing.address?.postalCode,
  ].filter(Boolean);

  const address =
    listing.fullAddress ??
    listing.addressLine ??
    (addressParts.length ? addressParts.join(', ') : undefined);

  const locality = listing.address?.city ?? listing.city ?? listing.neighborhood ?? listing.locality;

  return { address, locality };
}

async function fetchListingsPage(offset: number): Promise<ApiListing[]> {
  const url = new URL(`${BASE_URL}${LISTINGS_PATH.startsWith('/') ? '' : '/'}${LISTINGS_PATH}`);
  url.searchParams.set('limit', String(PAGE_SIZE));
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('hasPhoto', 'true');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`RE API responded with status ${response.status}: ${text}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const items =
    (Array.isArray((payload as any).listings) && (payload as any).listings) ||
    (Array.isArray((payload as any).data) && (payload as any).data) ||
    (Array.isArray((payload as any).results) && (payload as any).results) ||
    [];

  if (!Array.isArray(items)) {
    throw new Error('Unexpected RE API response shape.');
  }

  return items as ApiListing[];
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-z0-9_-]/gi, '_');
}

async function downloadImage(url: string, listingId: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image (${response.status})`);
  }
  const buffer = await response.arrayBuffer();
  const parsed = new URL(url);
  const ext = path.extname(parsed.pathname) || '.jpg';
  const fileName = `${sanitizeFileName(listingId)}${ext}`;
  await fs.writeFile(path.join(IMAGE_DIR, fileName), Buffer.from(buffer));
}

async function buildDataset() {
  await ensureDirectories();
  const collected: DatasetEntry[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let requests = 0;

  while (collected.length < TARGET_COUNT && requests < MAX_REQUESTS) {
    requests += 1;
    console.log(`Fetching listings offset=${offset} (current=${collected.length})`);
    const listings = await fetchListingsPage(offset);
    if (!listings.length) {
      console.log('No more listings returned by RE API.');
      break;
    }

    for (const listing of listings) {
      if (collected.length >= TARGET_COUNT) {
        break;
      }

      const listingId = extractListingId(listing);
      if (!listingId || seen.has(listingId)) {
        continue;
      }

      const coords = extractCoordinates(listing);
      const imageUrl = extractImageUrl(listing);
      if (!coords || !imageUrl) {
        continue;
      }

      const entry: DatasetEntry = {
        listingId,
        imageUrl,
        latitude: coords.latitude,
        longitude: coords.longitude,
        ...extractAddress(listing),
      };

      if (shouldDownloadImages) {
        try {
          await downloadImage(imageUrl, listingId);
        } catch (error) {
          console.warn(`Failed to download image for ${listingId}:`, (error as Error).message);
        }
      }

      collected.push(entry);
      seen.add(listingId);
    }

    offset += PAGE_SIZE;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    total: collected.length,
    target: TARGET_COUNT,
    notes: 'Baseline dataset for Snap-to-Search visual experiments.',
    listings: collected,
  };

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`Dataset written to ${OUTPUT_FILE} (${collected.length} entries).`);
  if (shouldDownloadImages) {
    console.log(`Images saved to ${IMAGE_DIR}`);
  }
}

buildDataset().catch((error) => {
  console.error('Failed to build dataset:', error);
  process.exit(1);
});
