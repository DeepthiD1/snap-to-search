import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import fetch from 'node-fetch';
import multer from "multer";
import {
  dHash64HexFromBuffer,
  loadPHashIndex,
  queryPHashTopK,
  defaultIndexPath,
  defaultImagesDir
} from "./services/pHashService";



import { VisualMatchService } from './services/visualMatchService';
import { MatchRankingService } from './services/matchRankingService';
import { SearchOrchestrator } from './services/searchOrchestrator';
import { InMemorySessionStore } from './services/sessionStore';
import { SnapToSearchController } from './controllers/snapToSearchController';
import { createSnapToSearchRouter } from './routes/snapToSearchRoutes';
import { createLogger } from './utils/logger';
import { ReApiCandidateService } from './services/reApiCandidateService';
import { MlsCandidateService } from './services/mlsCandidateService';

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





const visualMatchService = new VisualMatchService();
const matchRankingService = new MatchRankingService();

// NEW: live MLS candidate pool (instead of CSV/GeoFilterService)
const reApiCandidateService = new ReApiCandidateService(
  process.env.RE_API_BASE,
  process.env.RE_API_KEY
);
const mlsCandidateService = new MlsCandidateService(reApiCandidateService);

// IMPORTANT: SearchOrchestrator now takes mlsCandidateService first
const searchOrchestrator = new SearchOrchestrator(
  mlsCandidateService,
  visualMatchService,
  matchRankingService
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
