import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { createLogger } from '../utils/logger';

export class ImageEmbeddingService {
  private log = createLogger('ImageEmbeddingService');
  private extractorPromise: Promise<any> | null = null;

  // Default model: CLIP (512-dim)
  private modelId = process.env.IMAGE_EMBEDDING_MODEL ?? 'Xenova/clip-vit-base-patch32';

  getModelId() {
    return this.modelId;
  }

  private async getExtractor() {
    if (!this.extractorPromise) {
      this.extractorPromise = (async () => {
        // Dynamic import works fine from CommonJS
        const { pipeline, env } = await import('@huggingface/transformers');

        // Optional: custom cache location (handy on Windows)
        if (process.env.TRANSFORMERS_CACHE_DIR) {
          env.cacheDir = process.env.TRANSFORMERS_CACHE_DIR;
        }

        this.log.info('Loading image embedding model', { modelId: this.modelId });
        return pipeline('image-feature-extraction', this.modelId);
      })();
    }
    return this.extractorPromise;
  }

  async embedFromUrl(url: string): Promise<Float32Array> {
    const extractor = await this.getExtractor();
    const tensor = await extractor(url);
    return l2Normalize(tensor.data as Float32Array);
  }

  async embedFromBuffer(imageBytes: Buffer, extHint: 'jpg' | 'png' = 'jpg'): Promise<Float32Array> {
    // Transformers.js RawImage supports file paths/URLs well, so we write a temp file.
    // (This avoids edge cases around in-memory decoding.)
    const tmpDir = path.join(os.tmpdir(), 'snap-to-search');
    await fs.mkdir(tmpDir, { recursive: true });

    const filePath = path.join(tmpDir, `${crypto.randomBytes(16).toString('hex')}.${extHint}`);
    await fs.writeFile(filePath, imageBytes);

    try {
      const extractor = await this.getExtractor();
      const tensor = await extractor(filePath);
      return l2Normalize(tensor.data as Float32Array);
    } finally {
      fs.unlink(filePath).catch(() => {});
    }
  }
}

export function l2Normalize(vec: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) {
    const v = vec[i] ?? 0;
    sum += v * v;
  }
  const norm = Math.sqrt(sum) || 1;

  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) {
    out[i] = (vec[i] ?? 0) / norm;
  }
  return out;
}

export function dot(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) {
    s += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return s;
}

