import fetch from 'node-fetch';

import { CandidateWithDistance } from '../types';
import { dHash64HexFromBuffer } from './pHashService';
import { CandidateHashCache } from './candidateHashCache';
import { createLogger } from '../utils/logger';

const logger = createLogger('CandidateHashService');

export class CandidateHashService {
  private readonly inflight = new Map<string, Promise<string | null>>();

  constructor(private readonly cache: CandidateHashCache) {}

  async getHash(candidate: CandidateWithDistance): Promise<string | null> {
    await this.cache.ready();

    const propertyId = candidate.propertyId;
    if (!propertyId) {
      return null;
    }

    const cached = this.cache.get(propertyId);
    if (cached) {
      return cached.hash;
    }

    const pending = this.inflight.get(propertyId);
    if (pending) {
      return pending;
    }

    const promise = this.downloadAndHash(candidate.previewImageUrl)
      .then((hash) => {
        if (hash) {
          this.cache.set({
            propertyId,
            hash,
            previewImageUrl: candidate.previewImageUrl,
            updatedAt: new Date().toISOString(),
          });
        }
        return hash;
      })
      .catch((error) => {
        logger.warn('Failed to generate candidate hash', {
          propertyId,
          error: (error as Error).message,
        });
        return null;
      })
      .finally(() => {
        this.inflight.delete(propertyId);
      });

    this.inflight.set(propertyId, promise);
    return promise;
  }

  private async downloadAndHash(url?: string): Promise<string | null> {
    if (!url) {
      return null;
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Snap-to-Search/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download candidate image (${response.status})`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return dHash64HexFromBuffer(buffer);
  }
}
