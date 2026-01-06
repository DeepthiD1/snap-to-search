import crypto from 'crypto';
import path from 'path';
import { CandidateWithDistance, VisualMatchCandidate } from '../types';
import { createLogger } from '../utils/logger';
import { EmbeddingIndex } from './embeddingIndex';
import { ImageEmbeddingService, dot } from './imageEmbeddingService';

const logger = createLogger('VisualMatchService');

const MIN_VISUAL_SCORE = 0.0;
const MAX_VISUAL_SCORE = 1.0;

export class VisualMatchService {
  private readonly embedder = new ImageEmbeddingService();
  private readonly indexPath =
    process.env.IMAGE_INDEX_PATH ?? path.join(process.cwd(), 'dataset', 'image_index.json');

  private index: EmbeddingIndex | null = null;
  private indexLoadPromise: Promise<void> | null = null;

  constructor() {
    // Kick off index load on startup (don’t block server boot)
    this.indexLoadPromise = this.loadIndex();
  }

  async scoreCandidates(photo: Buffer, candidates: CandidateWithDistance[]): Promise<VisualMatchCandidate[]> {
    if (!candidates.length) return [];

    // Ensure index load finished (if it fails, we fallback below)
    if (this.indexLoadPromise) {
      await this.indexLoadPromise;
    }

    // If no index, fallback to the old deterministic placeholder scoring
    if (!this.index) {
      return candidates.map((candidate) => {
        const visualScore = this.deriveDeterministicScore(photo, candidate.propertyId);
        const cues = this.buildCues(candidate, visualScore, 'placeholder_hash_score');
        return { ...candidate, visualScore, cues };
      });
    }

    // Real embedding-based similarity
    const queryVec = await this.embedder.embedFromBuffer(photo);

    return candidates.map((candidate) => {
      const candVec = this.index?.get(candidate.propertyId);

      if (!candVec) {
        const visualScore = 0;
        const cues = this.buildCues(candidate, visualScore, 'no_embedding_for_listing');
        return { ...candidate, visualScore, cues };
      }

      // cosine similarity via dot product after L2-normalization
      const sim = dot(queryVec, candVec);
      const visualScore = clamp((sim + 1) / 2, MIN_VISUAL_SCORE, MAX_VISUAL_SCORE);

      const cues = this.buildCues(candidate, visualScore, 'clip_embedding_cosine');
      return { ...candidate, visualScore: Number(visualScore.toFixed(3)), cues };
    });
  }

  private async loadIndex(): Promise<void> {
    try {
      const idx = new EmbeddingIndex(this.indexPath);
      await idx.load();
      this.index = idx;
      logger.info('Loaded image embedding index', { indexPath: this.indexPath });
    } catch (e: any) {
      this.index = null;
      logger.warn('Could not load image embedding index; using placeholder scoring', {
        indexPath: this.indexPath,
        error: e?.message ?? String(e),
      });
    }
  }

  private deriveDeterministicScore(photo: Buffer, propertyId: string): number {
    const hash = crypto
      .createHash('sha256')
      .update(photo.subarray(0, Math.min(photo.length, 256)))
      .update(propertyId)
      .digest();

    const int32 = hash.readUInt32BE(0);
    const normalized = int32 / 0xffffffff;
    return Number(normalized.toFixed(3));
  }

  private buildCues(candidate: CandidateWithDistance, visualScore: number, mode: string): string[] {
    const cues: string[] = [mode];

    if (visualScore > 0.85) cues.push('Very strong visual match');
    else if (visualScore > 0.7) cues.push('Strong visual similarity');
    else if (visualScore > 0.55) cues.push('Moderate visual similarity');

    if (candidate.features.porch) cues.push('Porch present');
    if (candidate.features.garage) cues.push('Garage present');

    return cues;
  }
}

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  return Math.min(Math.max(v, min), max);
}
