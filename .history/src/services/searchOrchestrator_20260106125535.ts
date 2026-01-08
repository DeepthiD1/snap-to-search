import { MlsCandidateService } from './mlsCandidateService';
import { VisualMatchService } from './visualMatchService';
import { MatchRankingService } from './matchRankingService';
import { ListingMediaService } from './listingMediaService';
import { SearchResponse, SearchResponseStatus, SnapToSearchRequest } from '../types';
import { computeRadius, normalizeLocation } from '../utils/location';
import { createLogger } from '../utils/logger';

const logger = createLogger('SearchOrchestrator');

export class SearchOrchestrator {
  constructor(
    private readonly geoFilterService: GeoFilterService,
    private readonly visualMatchService: VisualMatchService,
    private readonly matchRankingService: MatchRankingService,
    private readonly listingMediaService?: ListingMediaService
  ) {}

  async handleSnapToSearch(payload: SnapToSearchRequest): Promise<SearchResponse> {
    const normalizedLocation = normalizeLocation(payload.deviceLocation, payload.exifLocation);
    const expansionLevel = payload.expansionLevel ?? 0;
    const radiusComputation = computeRadius(
      normalizedLocation?.accuracyMeters,
      expansionLevel,
      payload.radiusOverrideMeters
    );
    const radiusMeters = radiusComputation?.radiusMeters ?? 0;
    const baseRadiusMeters = radiusComputation?.baseRadiusMeters ?? 0;
    const matchLimit = this.resolveMatchLimit(expansionLevel);

    logger.info('Running snap-to-search orchestration', {
      sessionId: payload.metadata.sessionId,
      expansionLevel,
      radiusMeters,
    });

    const geoCandidates = this.geoFilterService.findCandidates(normalizedLocation, radiusMeters);
    const candidatesWithMedia = this.listingMediaService
      ? await this.listingMediaService.enrichMedia(geoCandidates)
      : geoCandidates;
    const visualMatches = await this.visualMatchService.scoreCandidates(payload.photo, candidatesWithMedia);
    const ranked = this.matchRankingService.rankCandidates(visualMatches, { radiusMeters, limit: matchLimit });

    const status = this.resolveStatus(ranked.length, expansionLevel);

    return {
      matches: ranked,
      candidateCount: geoCandidates.length,
      radiusMeters,
      baseRadiusMeters,
      expansionLevel,
      usedLocation: normalizedLocation,
      status,
    } satisfies SearchResponse;
  }

  private resolveStatus(matchCount: number, expansionLevel: number): SearchResponseStatus {
    if (matchCount === 0 && expansionLevel === 0) {
      return 'none';
    }
    if (expansionLevel > 0) {
      return 'expanded';
    }
    return 'matches';
  }

  private resolveMatchLimit(expansionLevel: number): number {
    const baseLimit = 5;
    const increment = 5;
    const maxLimit = 20;
    const computed = baseLimit + expansionLevel * increment;
    return Math.min(computed, maxLimit);
  }
}
