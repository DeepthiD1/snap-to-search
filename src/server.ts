import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import multer from 'multer';
import exifr from 'exifr';

import { CandidateHashCache } from './services/candidateHashCache';
import { CandidateHashService } from './services/candidateHashService';
import { dHash64HexFromBuffer, hammingHex64 } from './services/pHashService';
import { MlsCandidateService } from './services/mlsCandidateService';
import { ReApiCandidateService } from './services/reApiCandidateService';
import { computeRadius, normalizeLocation } from './utils/location';
import { CandidateWithDistance, RawLocationInput } from './types';
import { createLogger } from './utils/logger';

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

function normalizeAddress(input?: string): string | null {
  if (!input) return null;
  const trimmedInput = input.trim();
  if (!trimmedInput) return null;
  const commaIndex = trimmedInput.indexOf(',');
  const firstPart = commaIndex === -1 ? trimmedInput : trimmedInput.slice(0, commaIndex).trim();
  if (!firstPart) return null;
  return firstPart.toLowerCase();
}

function dedupeCandidates(list: CandidateWithDistance[]): CandidateWithDistance[] {
  const seen = new Set<string>();
  const output: CandidateWithDistance[] = [];
  for (const candidate of list) {
    const addressKey = normalizeAddress(candidate.addressLine);
    const key = addressKey ?? candidate.propertyId ?? candidate.previewImageUrl;
    if (!key) {
      output.push(candidate);
      continue;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(candidate);
  }
  return output;
}

function dedupeMatches(
  matches: { candidate: CandidateWithDistance; hash: string; distance: number }[]
): { candidate: CandidateWithDistance; hash: string; distance: number }[] {
  const seen = new Set<string>();
  const output: { candidate: CandidateWithDistance; hash: string; distance: number }[] = [];
  for (const match of matches) {
    const addressKey = normalizeAddress(match.candidate.addressLine);
    const key = addressKey ?? match.candidate.propertyId ?? match.candidate.previewImageUrl;
    if (!key) {
      continue;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(match);
  }
  return output;
}

dotenv.config();

const logger = createLogger('Server');
const app = express();
const DEFAULT_RADIUS_METERS = 1609.344;
const TOP_K_RESULTS = 20;

const corsOptions: cors.CorsOptions = {
  origin: true,
  credentials: true,
};

app.use(cors(corsOptions));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const reApiCandidateService = new ReApiCandidateService(process.env.RE_API_BASE, process.env.RE_API_KEY);
const mlsCandidateService = new MlsCandidateService(reApiCandidateService);
const candidateCache = new CandidateHashCache();
const candidateHashService = new CandidateHashService(candidateCache);

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'snap-to-search', docs: '/api/health' });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'snap-to-search', timestamp: new Date().toISOString() });
});

async function start() {
  await candidateCache.ready();

app.post('/api/phash-test', upload.single('photo'), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'photo is required' });
    }

    const radiusOverrideMeters = parseFiniteNumber(req.body.radiusOverrideMeters);
    const fallbackAccuracy = radiusOverrideMeters ?? DEFAULT_RADIUS_METERS;

    const manualLocation = buildManualLocation(req.body);
    const exifLocation = manualLocation ? undefined : await extractExifLocation(req.file.buffer, fallbackAccuracy);
    if (!exifLocation) {
      if (!manualLocation) {
        logger.warn('Missing EXIF location', { sessionId: req.body.sessionId });
        return res.status(400).json({ error: 'Uploaded photo does not contain GPS EXIF data.' });
      }
    }

    const normalizedLocation = normalizeLocation(manualLocation, exifLocation);
    if (!normalizedLocation) {
      logger.warn('Failed to normalize EXIF location', { exifLocation });
      return res.status(400).json({ error: 'Invalid EXIF location data.' });
    }

    const radiusComputation = computeRadius(normalizedLocation.accuracyMeters, 0, radiusOverrideMeters);
    const radiusMeters = radiusComputation?.radiusMeters ?? radiusOverrideMeters ?? DEFAULT_RADIUS_METERS;

    const candidates = dedupeCandidates(
      await mlsCandidateService.findCandidates({
        location: normalizedLocation,
        radiusMeters,
        size: 50,
        active: true,
      })
    );

    const queryHash = await dHash64HexFromBuffer(req.file.buffer);

    const hashedCandidates = await Promise.all(
      candidates.map(async (candidate) => {
        const hash = await candidateHashService.getHash(candidate);
        if (!hash) return null;
        return {
          candidate,
          hash,
          distance: hammingHex64(queryHash, hash),
        };
      })
    );

    const sortedMatches = hashedCandidates
      .filter((entry): entry is { candidate: CandidateWithDistance; hash: string; distance: number } => Boolean(entry))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, TOP_K_RESULTS);

    const uniqueMatches = dedupeMatches(sortedMatches);

    const finalMatches = uniqueMatches.slice(0, TOP_K_RESULTS).map((match) => {
      const cand = match.candidate;
      const details: ListingSummary = {
        listingId: cand.propertyId ?? '',
        addressLine: cand.addressLine,
        city: cand.city,
        state: cand.state,
        zip: cand.zip,
        price: typeof cand.listPriceLow === 'number' ? cand.listPriceLow : null,
        beds: typeof cand.bedroomsTotal === 'number' ? cand.bedroomsTotal : null,
        baths: typeof cand.bathroomsTotal === 'number' ? cand.bathroomsTotal : null,
        sqft: typeof cand.livingArea === 'number' ? cand.livingArea : null,
        listingUrl: cand.listingUrl ?? null,
      };

      return {
        listingId: cand.propertyId,
        filename: cand.propertyId,
        hash: match.hash,
        distance: match.distance,
        previewImageUrl: cand.previewImageUrl,
        details,
      };
    });

    res.json({
      queryHash,
      top: finalMatches,
      radiusMeters,
      candidateCount: candidates.length,
    });
  });

  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => {
    logger.info(`[Server] Snap-to-Search (phash-mls pipeline) listening on port ${port}`);
  });
}

start().catch((error) => {
  logger.error('Failed to start server', { error: (error as Error).message });
  process.exit(1);
});

async function extractExifLocation(buffer: Buffer, fallbackAccuracyMeters: number): Promise<RawLocationInput | undefined> {
  try {
    const metadata = (await exifr.gps(buffer)) as unknown as Record<string, unknown> | undefined;
    const extractNumber = (value: unknown): number | undefined =>
      typeof value === 'number' && Number.isFinite(value) ? value : undefined;

    const latitude = extractNumber(metadata?.['latitude']);
    const longitude = extractNumber(metadata?.['longitude']);
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return undefined;
    }

    const precisionCandidates = [
      extractNumber(metadata?.['GPSDOP']),
      extractNumber(metadata?.['gpsDOP']),
      extractNumber(metadata?.['DOP']),
      extractNumber(metadata?.['precision']),
    ];
    const dop = precisionCandidates.find((value): value is number => typeof value === 'number');
    const accuracyMeters = Math.max(
      typeof dop === 'number' && dop > 0 ? dop * 5 : fallbackAccuracyMeters,
      50
    );

    return {
      latitude,
      longitude,
      accuracyMeters,
      source: 'exif',
    };
  } catch (error) {
    logger.warn('Failed to read EXIF metadata', { error: (error as Error).message });
    return undefined;
  }
}

function parseFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function buildManualLocation(body: Record<string, unknown>): RawLocationInput | undefined {
  const latitude = parseFiniteNumber(body.manualLatitude);
  const longitude = parseFiniteNumber(body.manualLongitude);
  if (typeof latitude === 'number' && typeof longitude === 'number') {
    const accuracy = parseFiniteNumber(body.manualAccuracy);
    return {
      latitude,
      longitude,
      accuracyMeters: Math.max(accuracy ?? 50, 50),
      source: 'device',
    };
  }
  return undefined;
}

// MLS Detail is not used anymore since we rely on the enriched MLSSearch payload.
