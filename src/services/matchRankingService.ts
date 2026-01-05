import { RankedMatchResult, VisualMatchCandidate } from '../types';

interface RankOptions {
  radiusMeters?: number;
  limit?: number;
}

const WEIGHTS = {
  visual: 0.6,
  geo: 0.3,
  metadata: 0.1,
};

export class MatchRankingService {
  rankCandidates(candidates: VisualMatchCandidate[], options: RankOptions): RankedMatchResult[] {
    const limit = this.resolveLimit(options.limit);
    const ranked = candidates
      .map((candidate) => {
        const geoScore = this.computeGeoScore(candidate.distanceMeters, options.radiusMeters);
        const metadataScore = this.computeMetadataScore(candidate);
        const confidence = this.clamp(
          WEIGHTS.visual * candidate.visualScore +
            WEIGHTS.geo * geoScore +
            WEIGHTS.metadata * metadataScore
        );

        return {
          propertyId: candidate.propertyId,
          addressLine: candidate.addressLine,
          previewImageUrl: candidate.previewImageUrl,
          distanceMeters: Math.round(candidate.distanceMeters),
          confidence: Number(confidence.toFixed(3)),
          confidenceLabel: this.mapConfidenceLabel(confidence),
          reasons: this.buildReasons(candidate, geoScore),
          metadata: {
            visualScore: candidate.visualScore,
            geoScore: Number(geoScore.toFixed(3)),
            metadataScore: Number(metadataScore.toFixed(3)),
          },
        } satisfies RankedMatchResult;
      })
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit);

    return ranked;
  }

  private resolveLimit(limit?: number): number {
    if (typeof limit === 'number' && limit > 0) {
      return Math.min(Math.floor(limit), 50);
    }
    return 5;
  }

  private computeGeoScore(distanceMeters: number, radiusMeters?: number): number {
    if (!radiusMeters || radiusMeters <= 0) {
      return 0;
    }

    const ratio = Math.max(0, 1 - distanceMeters / (radiusMeters * 1.1));
    return this.clamp(ratio);
  }

  private computeMetadataScore(candidate: VisualMatchCandidate): number {
    let score = 0.5;
    if (candidate.features.roofStyle === 'gable') {
      score += 0.1;
    }
    if (candidate.features.porch) {
      score += 0.1;
    }
    if (candidate.features.garage) {
      score += 0.05;
    }
    return this.clamp(score);
  }

  private mapConfidenceLabel(confidence: number): RankedMatchResult['confidenceLabel'] {
    if (confidence >= 0.9) {
      return 'very_high';
    }
    if (confidence >= 0.75) {
      return 'high';
    }
    if (confidence >= 0.55) {
      return 'medium';
    }
    return 'low';
  }

  private buildReasons(candidate: VisualMatchCandidate, geoScore: number): string[] {
    const reasons = new Set<string>();
    if (candidate.visualScore > 0.8) {
      reasons.add('Strong facade similarity');
    } else if (candidate.visualScore > 0.65) {
      reasons.add('Moderate architectural similarity');
    }

    if (geoScore > 0.7) {
      reasons.add('Within immediate proximity');
    } else if (geoScore > 0.5) {
      reasons.add('Nearby according to GPS');
    }

    candidate.cues.forEach((cue) => reasons.add(cue));
    return Array.from(reasons);
  }

  private clamp(value: number, min = 0, max = 1): number {
    return Math.min(Math.max(value, min), max);
  }
}
