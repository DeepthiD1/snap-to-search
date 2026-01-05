import { CandidateWithDistance, NormalizedLocation, PropertyCandidate } from '../types';
import { distanceBetween } from '../utils/location';
import { createLogger } from '../utils/logger';

const logger = createLogger('GeoFilterService');

export class GeoFilterService {
  constructor(private readonly properties: PropertyCandidate[]) {}

  findCandidates(location?: NormalizedLocation, radiusMeters?: number): CandidateWithDistance[] {
    if (!location) {
      logger.info('No location provided; returning all dataset entries');
      return this.properties.map((property) => ({ ...property, distanceMeters: 0 }));
    }

    const effectiveRadius = typeof radiusMeters === 'number' && radiusMeters > 0 ? radiusMeters : Infinity;
    logger.info('Filtering properties by radius', { radiusMeters: effectiveRadius, source: location.source });

    return this.properties
      .map((property) => {
        const distanceMeters = distanceBetween(location, property);
        return { ...property, distanceMeters };
      })
      .filter((candidate) => candidate.distanceMeters <= effectiveRadius)
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }
}
