import crypto from 'crypto';
import path from 'path';
import { CandidateWithDistance, VisualMatchCandidate } from '../types';
import { createLogger } from '../utils/logger';
import { EmbeddingIndex } from './embeddingIndex';
import { ImageEmbeddingService, dot } from './imageEmbeddingService';

const logger = createLogger('VisualMatchService');

const MIN_VISUAL_SCORE = 0.0;
const MAX_VISUAL_SCORE = 1.0;

// Keep a local cache so repeated searches don’t re-download/re-embed the same listing photos.
const RUNTIME_CACHE_MAX = 2000;

export class VisualMatchService {
  private readonly embedder = new ImageEmbeddingService();
  private readonly indexPath =
    process.env.IMAGE_INDEX_PATH ?? path.join(process.cwd(), 'dataset', 'image_index.json');

  private index: EmbeddingIndex | null = null;
  private indexLoadPromise: Promise<void> | null = null;

  private readonly runtimeVectors = new Map<string, Float32Array>();
  private readonly runtimeInFlight = new Map<string, Promise<Float32Array | null>>();

  constructor() {
    this.indexLoadPromise = this.loadIndex();
  }

  async scoreCandidates(photo: Buffer, candidates: CandidateWithDistance[]): Promise<VisualMatchCandidate[]> {
    if (!candidates.length) return [];

    // Ensure index load finished (if it fails, we fallback to runtime embeddings below)
    if (this.indexLoadPromise) {
      await this.indexLoadPromise;
    }

    const queryVec = await this.embedder.embedFromBuffer(photo);

    // Compute/get embeddings for all candidates (index -> cache -> runtime)
    const vectors = await Promise.all(candidates.map((c) => this.getVectorForCandidate(c)));

    return candidates.map((candidate, idx) => {
      const candVec = vectors[idx];

      if (!candVec) {
        const visualScore = 0;
        const cues = this.buildCues(candidate, visualScore, 'no_embedding_no_image');
        return { ...candidate, visualScore, cues };
      }

      const sim = dot(queryVec, candVec);
      const visualScore = clamp((sim + 1) / 2, MIN_VISUAL_SCORE, MAX_VISUAL_SCORE);

      const sourceCue = this.index?.get(candidate.propertyId)
        ? 'clip_embedding_cosine_index'
        : 'clip_embedding_cosine_runtime';

      const cues = this.buildCues(candidate, visualScore, sourceCue);
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
      logger.warn('Could not load image embedding index; will use runtime embeddings', {
        indexPath: this.indexPath,
        error: e?.message ?? String(e),
      });
    }
  }

  private async getVectorForCandidate(candidate: CandidateWithDistance): Promise<Float32Array | null> {
    const id = candidate.propertyId;

    // 1) From prebuilt index (fastest)
    const fromIndex = this.index?.get(id);
    if (fromIndex) return fromIndex;

    // 2) From runtime cache (fast)
    const cached = this.runtimeVectors.get(id);
    if (cached) return cached;

    // 3) Need to compute from image URL
    const url = candidate.previewImageUrl;
    if (!url) return null;

    // Deduplicate concurrent requests
    const inflight = this.runtimeInFlight.get(id);
    if (inflight) return inflight;

    const p = this.embedder
      .embedFromUrl(url)
      .then((vec) => {
        this.runtimeVectors.set(id, vec);

        // simple eviction to avoid unbounded memory
        if (this.runtimeVectors.size > RUNTIME_CACHE_MAX) {
          const oldestKey = this.runtimeVectors.keys().next().value;
          if (oldestKey) this.runtimeVectors.delete(oldestKey);
        }

        return vec;
      })
      .catch((e: any) => {
        logger.warn('Failed to embed candidate image', { propertyId: id, error: e?.message ?? String(e) });
        return null;
      })
      .finally(() => {
        this.runtimeInFlight.delete(id);
      });

    this.runtimeInFlight.set(id, p);
    return p;
  }

  // Keeping this around just in case you want a hard fallback later
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

    if (candidate.features?.porch) cues.push('Porch present');
    if (candidate.features?.garage) cues.push('Garage present');

    return cues;
  }
}

function clamp(v: number, min: number, max: number): number {
  if (Number.isNaN(v)) return min;
  return Math.min(Math.max(v, min), max);
}
