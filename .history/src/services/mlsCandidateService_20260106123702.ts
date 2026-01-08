import { CandidateWithDistance, NormalizedLocation } from '../types';
import { distanceBetween } from '../utils/location';
import { createLogger } from '../utils/logger';
import { ReApiCandidateService } from './reApiCandidateService';

const logger = createLogger('MlsCandidateService');

export class MlsCandidateService {
  constructor(private readonly reApi: ReApiCandidateService) {}

  async findCandidates(params: {
    location?: NormalizedLocation;
    radiusMeters?: number;
    size?: number;
    active?: boolean;
  }): Promise<CandidateWithDistance[]> {
    const { location, radiusMeters, size, active } = params;

    if (!location) {
      logger.warn('No location provided; cannot run MLSSearch candidate fetch');
      return [];
    }

    const radiusMiles = clamp(
      typeof radiusMeters === 'number' ? radiusMeters / 1609.344 : 1,
      0.1,
      10
    );

    const raw = await this.reApi.mlsSearchByRadius({
      latitude: location.latitude,
      longitude: location.longitude,
      radiusMiles,
      size: size ?? 50,
      active: active ?? true,
    });

    // Map to your internal candidate type
    const candidates: CandidateWithDistance[] = raw
      .map((item) => {
        if (!item.imageUrl) return null;
        if (typeof item.latitude !== 'number' || typeof item.longitude !== 'number') return null;

        const dist = distanceBetween(location, { latitude: item.latitude, longitude: item.longitude });

        return {
          propertyId: item.propertyId,
          mlsId: item.propertyId, // can refine later
          addressLine: item.addressLabel ?? item.propertyId,
          latitude: item.latitude,
          longitude: item.longitude,
          previewImageUrl: item.imageUrl,
          galleryImageUrls: [item.imageUrl], // can expand later via MLSDetail
          distanceMeters: dist,
          features: {
            propertyType: 'single_family',
            stories: 0,
            garage: false,
            exteriorColor: 'unknown',
            roofStyle: 'gable',
            porch: false,
            notes: 'MLS candidate (runtime)',
          },
        };
      })
      .filter(Boolean) as CandidateWithDistance[];

    // nearest first (nice for debugging)
    candidates.sort((a, b) => a.distanceMeters - b.distanceMeters);

    logger.info('Built MLS candidate pool', { count: candidates.length, radiusMiles });
    return candidates;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
