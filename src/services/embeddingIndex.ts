import fs from 'fs/promises';

export type ImageIndexFile = {
  model: string;
  dim: number;
  createdAt: string;
  vectors: Record<string, string>; // propertyId -> base64(Float32Array)
};

export class EmbeddingIndex {
  private vectors = new Map<string, Float32Array>();

  constructor(private indexPath: string) {}

  async load(): Promise<void> {
    const raw = await fs.readFile(this.indexPath, 'utf-8');
    const parsed = JSON.parse(raw) as ImageIndexFile;

    for (const [propertyId, b64] of Object.entries(parsed.vectors)) {
      this.vectors.set(propertyId, base64ToFloat32(b64));
    }
  }

  has(propertyId: string) {
    return this.vectors.has(propertyId);
  }

  get(propertyId: string) {
    return this.vectors.get(propertyId);
  }
}

export function float32ToBase64(arr: Float32Array): string {
  const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  return buf.toString('base64');
}

export function base64ToFloat32(b64: string): Float32Array {
  const buf = Buffer.from(b64, 'base64');
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}
