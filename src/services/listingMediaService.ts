import fetch from 'node-fetch';
import { CandidateWithDistance } from '../types';
import { createLogger } from '../utils/logger';

interface ListingMediaServiceOptions {
  baseUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
}

interface RemoteMediaResponse {
  previewImageUrl?: string;
  galleryImageUrls?: string[];
  images?: Array<{ url: string }>;
}

const logger = createLogger('ListingMediaService');

export class ListingMediaService {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeoutMs: number;

  constructor(options: ListingMediaServiceOptions = {}) {
    this.baseUrl = options.baseUrl ?? 'https://api.reapi.com/v1';
    this.apiKey = options.apiKey ?? process.env.RE_API_KEY;
    this.timeoutMs = options.timeoutMs ?? 3500;
  }

  async enrichMedia(candidates: CandidateWithDistance[]): Promise<CandidateWithDistance[]> {
    if (!this.apiKey) {
      logger.warn('RE API key is not configured; returning mock media');
      return candidates;
    }

    const enriched = await Promise.all(
      candidates.map(async (candidate) => {
        try {
          const media = await this.fetchMedia(candidate.propertyId);
          if (!media) {
            return candidate;
          }

          const preview = media.previewImageUrl ?? media.galleryImageUrls?.[0];
          const gallery = media.galleryImageUrls?.length
            ? media.galleryImageUrls
            : media.images?.map((image) => image.url).filter(Boolean) ?? candidate.galleryImageUrls;

          return {
            ...candidate,
            previewImageUrl: preview ?? candidate.previewImageUrl,
            galleryImageUrls: gallery?.length ? gallery : candidate.galleryImageUrls,
          };
        } catch (error) {
          logger.warn('Failed to fetch listing media', { propertyId: candidate.propertyId, error });
          return candidate;
        }
      })
    );

    return enriched;
  }

  private async fetchMedia(propertyId: string): Promise<RemoteMediaResponse | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/listings/${propertyId}/media`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`RE API responded with status ${response.status}`);
      }

      const payload = (await response.json()) as RemoteMediaResponse;
      return payload;
    } finally {
      clearTimeout(timeout);
    }
  }
}
