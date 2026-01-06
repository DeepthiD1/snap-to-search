import crypto from 'crypto';
import { CandidateWithDistance, VisualMatchCandidate } from '../types';

const MIN_VISUAL_SCORE = 0.35;
const MAX_VISUAL_SCORE = 0.98;

export class VisualMatchService {
  async scoreCandidates(photo: Buffer, candidates: CandidateWithDistance[]): Promise<VisualMatchCandidate[]> {
    if (!candidates.length) {
      return [];
    }

    return candidates.map((candidate) => {
      const visualScore = this.deriveDeterministicScore(photo, candidate.propertyId);
      const cues = this.buildCues(candidate, visualScore);
      return { ...candidate, visualScore, cues };
    });
  }

  private deriveDeterministicScore(photo: Buffer, propertyId: string): number {
    const hash = crypto
      .createHash('sha256')
      .update(photo.subarray(0, Math.min(photo.length, 256)))
      .update(propertyId)
      .digest();

    const int32 = hash.readUInt32BE(0);
    const normalized = int32 / 0xffffffff;
    const score = MIN_VISUAL_SCORE + normalized * (MAX_VISUAL_SCORE - MIN_VISUAL_SCORE);
    return Number(score.toFixed(3));
  }

  private buildCues(candidate: CandidateWithDistance, visualScore: number): string[] {
    const cues: string[] = [];
    if (visualScore > 0.8) {
      cues.push('High facade texture alignment');
    } else if (visualScore > 0.65) {
      cues.push('Moderate architectural similarity');
    }

    if (candidate.features.porch) {
      cues.push('Porch silhouette detected');
    }

    if (candidate.features.garage) {
      cues.push('Garage opening geometry match');
    }

    return cues;
  }
}
