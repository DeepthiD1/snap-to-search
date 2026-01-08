import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import fetch from 'node-fetch';


import { GeoFilterService } from './services/geoFilterService';
import { VisualMatchService } from './services/visualMatchService';
import { MatchRankingService } from './services/matchRankingService';
import { ListingMediaService } from './services/listingMediaService';
import { SearchOrchestrator } from './services/searchOrchestrator';
import { InMemorySessionStore } from './services/sessionStore';
import { SnapToSearchController } from './controllers/snapToSearchController';
import { createSnapToSearchRouter } from './routes/snapToSearchRoutes';
import { loadPropertiesFromCsv } from './data/csvPropertyLoader';
import { createLogger } from './utils/logger';

dotenv.config();

const logger = createLogger('Server');
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    logger.warn('Blocked CORS origin', { origin });
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

const datasetPath = process.env.DATASET_CSV_PATH ?? path.join(process.cwd(), 'dataset', 'sample_listings.csv');
const properties = loadPropertiesFromCsv(datasetPath);

const geoFilterService = new GeoFilterService(properties);
const visualMatchService = new VisualMatchService();
const matchRankingService = new MatchRankingService();
const listingMediaService = new ListingMediaService({
  baseUrl: process.env.RE_API_BASE,
  apiKey: process.env.RE_API_KEY,
});
const searchOrchestrator = new SearchOrchestrator(
  geoFilterService,
  visualMatchService,
  matchRankingService,
  listingMediaService
);
const sessionStore = new InMemorySessionStore();
const controller = new SnapToSearchController(searchOrchestrator, sessionStore);

const app = express();

app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'snap-to-search', docs: '/api/health' });
});

app.get('/health', controller.health);

app.use('/api', createSnapToSearchRouter(controller));
app.post('/api/reapi/mls-search', async (req, res) => {
  const base = process.env.RE_API_BASE;
  const key = process.env.RE_API_KEY;

  if (!base || !key) {
    return res.status(500).json({ error: 'Missing RE_API_BASE or RE_API_KEY in .env' });
  }

    const body = req.body ?? {};

  // Base payload
  const payload: any = {
    active: body.active ?? true,
    size: body.size ?? 20,
  };

  // If lat/long provided, do radius search (radius is in miles for this API)
  if (typeof body.latitude === 'number' && typeof body.longitude === 'number') {
    const radiusMilesRaw =
      typeof body.radiusMiles === 'number'
        ? body.radiusMiles
        : typeof body.radiusMeters === 'number'
          ? body.radiusMeters / 1609.344
          : 1; // default 1 mile

    const radiusMiles = Math.max(0.1, Math.min(10, radiusMilesRaw)); // clamp to 0.1–10 miles

    payload.latitude = body.latitude;
    payload.longitude = body.longitude;
    payload.radius = radiusMiles;
  } else {
    // Otherwise fall back to city/state/zip search
    payload.city = body.city;
    payload.state = body.state;
    payload.zipCode = body.zipCode;
  }


  const r = await fetch(`${base}/v2/MLSSearch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
    },
    body: JSON.stringify(payload),
  });

  const text = await r.text();
  res.status(r.status).type('application/json').send(text);
});


app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ error: 'Unexpected server error' });
});

const port = process.env.PORT ?? 4000;
app.listen(port, () => {
  logger.info(`Snap-to-Search service listening on port ${port}`, { allowedOrigins });
});
