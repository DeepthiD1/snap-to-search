import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import multer from 'multer';

import {
  dHash64HexFromBuffer,
  loadPHashIndex,
  queryPHashTopK,
  defaultIndexPath,
  defaultImagesDir,
} from './services/pHashService';

import { createLogger } from './utils/logger';

dotenv.config();

const logger = createLogger('Server');

const app = express();

// ✅ Dev CORS (open)
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

// Body parsers (not used for multipart, but fine to keep)
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ✅ Multer for file upload (ONLY ONCE)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ✅ Serve downloaded MLS images so frontend can display results
// Example URL: http://localhost:4000/static/mls_images_10/1053764095.jpg
app.use('/static/mls_images_10', express.static(defaultImagesDir()));

// Root + health
app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'snap-to-search', docs: '/api/health' });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'snap-to-search', timestamp: new Date().toISOString() });
});

// ✅ pHash endpoint (what your frontend button should call)
app.post('/api/phash-test', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'photo is required' });
    }

    const indexPath = defaultIndexPath();
    const index = loadPHashIndex(indexPath);

    const queryHash = await dHash64HexFromBuffer(req.file.buffer);
    const top = queryPHashTopK({ queryHashHex: queryHash, index, k: 5 });

    return res.json({
      queryHash,
      top: top.map((t) => ({
        listingId: t.listingId,
        filename: t.filename,
        hash: t.hash,
        distance: t.distance,
        // frontend can use this directly in <img src="...">
        previewImageUrl: `/static/mls_images_10/${t.filename}`,
      })),
    });
  } catch (err) {
    logger.error('pHash test failed', { error: (err as Error).message });
    return res.status(500).json({ error: (err as Error).message || 'pHash failed' });
  }
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ error: 'Unexpected server error' });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  logger.info(`Snap-to-Search (pHash-only) listening on port ${port}`);
});
