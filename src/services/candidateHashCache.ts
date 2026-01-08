import fs from 'fs/promises';
import path from 'path';

import { createLogger } from '../utils/logger';

const logger = createLogger('CandidateHashCache');

export type CandidateHashRecord = {
  propertyId: string;
  hash: string;
  previewImageUrl?: string;
  updatedAt: string;
};

export class CandidateHashCache {
  private readonly filePath: string;
  private readonly entries = new Map<string, CandidateHashRecord>();
  private readonly loadPromise: Promise<void>;
  private writeChain = Promise.resolve();

  constructor(cachePath?: string) {
    this.filePath = cachePath ?? path.join(process.cwd(), 'dataset', 'candidate_hash_cache.json');
    this.loadPromise = this.loadFromDisk();
  }

  async ready(): Promise<void> {
    await this.loadPromise;
  }

  get(propertyId: string): CandidateHashRecord | undefined {
    return this.entries.get(propertyId);
  }

  set(entry: CandidateHashRecord): void {
    this.entries.set(entry.propertyId, entry);
    this.scheduleFlush();
  }

  private async loadFromDisk(): Promise<void> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as CandidateHashRecord[];
      parsed.forEach((record) => this.entries.set(record.propertyId, record));
      logger.info('Loaded candidate hash cache', { filePath: this.filePath, size: this.entries.size });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.info('Candidate hash cache not found; starting fresh', { filePath: this.filePath });
        return;
      }
      logger.warn('Failed to load candidate hash cache', { error: (error as Error).message });
    }
  }

  private scheduleFlush(): void {
    this.writeChain = this.writeChain
      .then(() => this.flush())
      .catch((error) => {
        logger.warn('Failed to persist candidate hash cache', { error: (error as Error).message });
      });
  }

  private async flush(): Promise<void> {
    const payload = Array.from(this.entries.values());
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(payload, null, 2), 'utf-8');
  }
}
