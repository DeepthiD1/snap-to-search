import { Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';

import { SearchOrchestrator } from '../services/searchOrchestrator';
import { InMemorySessionStore } from '../services/sessionStore';
import { RawLocationInput, SnapToSearchRequest } from '../types';
import { createLogger } from '../utils/logger';

const logger = createLogger('SnapToSearchController');

const bodySchema = z.object({
  sessionId: z.string().min(1),
  userLabel: z.string().optional(),
  hints: z.array(z.string()).optional(),
  deviceLatitude: z.number().optional(),
  deviceLongitude: z.number().optional(),
  deviceAccuracyMeters: z.number().optional(),
  exifLatitude: z.number().optional(),
  exifLongitude: z.number().optional(),
  exifAccuracyMeters: z.number().optional(),
  radiusOverrideMeters: z.number().optional(),
});

type ParsedBody = z.infer<typeof bodySchema>;

export class SnapToSearchController {
  private readonly upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

  constructor(
    private readonly orchestrator: SearchOrchestrator,
    private readonly sessionStore: InMemorySessionStore
  ) {}

  getUploaderMiddleware() {
    return this.upload.single('photo');
  }

  handleSnapToSearch = async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'A photo is required.' });
    }

    // ✅ Added: log raw input body to confirm what multipart fields arrived
    logger.info('snap-to-search input', { body: req.body });

    const parsedBody = this.parseBody(req.body);

    // ✅ Optional (but useful): log parsed/normalized body values
    logger.info('snap-to-search parsedBody', { parsedBody });

    try {
      const requestPayload = this.buildSnapRequest({
        fileBuffer: req.file.buffer,
        parsedBody,
        expansionLevel: 0,
      });

      const result = await this.orchestrator.handleSnapToSearch(requestPayload);

      const token = this.sessionStore.createSession({
        photo: req.file.buffer,
        sessionId: parsedBody.sessionId,
        deviceLocation: requestPayload.deviceLocation,
        exifLocation: requestPayload.exifLocation,
        radiusOverrideMeters: requestPayload.radiusOverrideMeters,
        metadata: requestPayload.metadata,
      });

      this.sessionStore.updateRunMetadata({
        token,
        normalizedLocation: result.usedLocation,
        baseRadiusMeters: result.baseRadiusMeters,
        expansionLevel: result.expansionLevel,
      });

      return res.status(200).json({ ...result, nextActionToken: token });
    } catch (error) {
      logger.error('Failed to process snap-to-search request', { error });
      return res.status(400).json({ error: (error as Error).message });
    }
  };

  handleExpandSearch = async (req: Request, res: Response) => {
    const token = req.params.token;
    if (!token) {
      return res.status(400).json({ error: 'A session token is required.' });
    }
    const session = this.sessionStore.get(token);

    if (!session) {
      return res.status(404).json({ error: 'Session not found. Please capture a new photo.' });
    }

    const expansionLevel = session.expansionLevel + 1;
    const metadata = session.metadata ?? {
      sessionId: session.sessionId,
    };

    try {
      const requestPayload: SnapToSearchRequest = {
        photo: session.photo,
        deviceLocation: session.deviceLocation,
        exifLocation: session.exifLocation,
        radiusOverrideMeters: session.radiusOverrideMeters,
        metadata,
        expansionLevel,
      };

      const result = await this.orchestrator.handleSnapToSearch(requestPayload);
      this.sessionStore.updateRunMetadata({
        token,
        normalizedLocation: result.usedLocation,
        baseRadiusMeters: result.baseRadiusMeters,
        expansionLevel,
      });

      return res.status(200).json({ ...result, nextActionToken: token });
    } catch (error) {
      logger.error('Failed to expand snap-to-search radius', { error });
      return res.status(400).json({ error: (error as Error).message });
    }
  };

  health = (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'snap-to-search', timestamp: new Date().toISOString() });
  };

  private parseBody(body: Record<string, unknown>): ParsedBody {
    const normalized: Record<string, unknown> = { ...body };
    const numericKeys: Array<keyof ParsedBody> = [
      'deviceLatitude',
      'deviceLongitude',
      'deviceAccuracyMeters',
      'exifLatitude',
      'exifLongitude',
      'exifAccuracyMeters',
      'radiusOverrideMeters',
    ];

    numericKeys.forEach((key) => {
      if (normalized[key] !== undefined && normalized[key] !== null) {
        const parsed = Number(normalized[key]);
        normalized[key] = Number.isFinite(parsed) ? parsed : undefined;
      }
    });

    if (typeof normalized.hints === 'string') {
      normalized.hints = this.parseHints(normalized.hints as string);
    }

    if (typeof normalized.hints === 'undefined') {
      normalized.hints = [];
    }

    const result = bodySchema.safeParse(normalized);
    if (!result.success) {
      throw new Error(result.error.issues[0]?.message ?? 'Invalid request payload.');
    }
    return result.data;
  }

  private parseHints(value: string): string[] {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((hint) => String(hint));
      }
    } catch (error) {
      // Fallback to comma separated parsing.
      logger.warn('Falling back to comma-separated hints parsing', { value });
    }
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private buildLocation(
    source: RawLocationInput['source'],
    latitude?: number,
    longitude?: number,
    accuracyMeters?: number
  ): RawLocationInput | undefined {
    // ✅ Change: allow location even if accuracyMeters wasn't provided (common with curl/frontend).
    if (typeof latitude === 'number' && typeof longitude === 'number') {
      const acc = typeof accuracyMeters === 'number' ? accuracyMeters : 50; // sensible default
      return { latitude, longitude, accuracyMeters: acc, source };
    }
    return undefined;
  }

  private buildSnapRequest(params: {
    fileBuffer: Buffer;
    parsedBody: ParsedBody;
    expansionLevel: number;
  }): SnapToSearchRequest {
    const { parsedBody, expansionLevel } = params;
    const deviceLocation = this.buildLocation(
      'device',
      parsedBody.deviceLatitude,
      parsedBody.deviceLongitude,
      parsedBody.deviceAccuracyMeters
    );
    const exifLocation = this.buildLocation(
      'exif',
      parsedBody.exifLatitude,
      parsedBody.exifLongitude,
      parsedBody.exifAccuracyMeters
    );

    return {
      photo: params.fileBuffer,
      deviceLocation,
      exifLocation,
      radiusOverrideMeters: parsedBody.radiusOverrideMeters,
      metadata: {
        sessionId: parsedBody.sessionId,
        userLabel: parsedBody.userLabel,
        hints: parsedBody.hints,
      },
      expansionLevel,
    } satisfies SnapToSearchRequest;
  }
}
